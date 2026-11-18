# app.py
from flask import Flask, request, send_file, jsonify
from flask_cors import CORS
import os
import subprocess
import shutil
from pathlib import Path
import uuid

app = Flask(__name__)
CORS(app)  # لتمكين CORS للسماح بالطلبات من أي نطاق (ضروري للتشغيل المحلي)

UPLOAD_FOLDER = Path('uploads')
PROCESSED_FOLDER = Path('processed')
TEMP_FOLDER = Path('temp_demucs_work')

# إنشاء المجلدات إذا لم تكن موجودة
UPLOAD_FOLDER.mkdir(exist_ok=True)
PROCESSED_FOLDER.mkdir(exist_ok=True)
TEMP_FOLDER.mkdir(exist_ok=True)

@app.route('/process_video', methods=['POST'])
def process_video():
    if 'video' not in request.files:
        return jsonify({"error": "No video file provided"}), 400

    file = request.files['video']
    if file.filename == '':
        return jsonify({"error": "No selected file"}), 400

    if file:
        unique_id = uuid.uuid4().hex
        original_filename = file.filename
        file_extension = Path(original_filename).suffix
        
        # حفظ الملف الأصلي
        input_video_path = UPLOAD_FOLDER / f"{unique_id}_original{file_extension}"
        file.save(input_video_path)

        # مسارات العمل المؤقتة
        temp_audio_path = TEMP_FOLDER / f"{unique_id}_audio.wav"
        temp_vocals_path = TEMP_FOLDER / f"htdemucs_ft/{unique_id}_audio/vocals.wav" # مسار Demucs الافتراضي للـ vocals
        output_video_path = PROCESSED_FOLDER / f"{Path(original_filename).stem}_nomusic.mp4"

        try:
            # 1. استخراج الصوت من الفيديو
            app.logger.info(f"Extracting audio from {input_video_path}")
            subprocess.run([
                "ffmpeg", "-y", "-i", input_video_path,
                "-vn", "-acodec", "pcm_s16le", "-ar", "44100", "-ac", "2", temp_audio_path
            ], check=True, capture_output=True)

            # 2. فصل الموسيقى باستخدام Demucs
            # نستخدم --shifts 5 لتحسين الجودة
            # -o TEMP_FOLDER يضع النواتج في مجلد مؤقت
            app.logger.info(f"Separating music using Demucs for {temp_audio_path}")
            subprocess.run([
                "python", "-m", "demucs",
                "--two-stems=vocals", # لفصل الغناء عن كل شيء آخر
                "-n", "htdemucs_ft",  # موديل Demucs عالي الجودة
                "-o", TEMP_FOLDER,    # مجلد الإخراج
                "--shifts", "5",      # لتحسين الجودة
                str(temp_audio_path)
            ], check=True, capture_output=True)
            
            # Demucs بيحط الملفات في مجلدات فرعية، لازم نلاقي الـ vocals.wav
            # المسار بيكون: TEMP_FOLDER/htdemucs_ft/<اسم_ملف_الصوت_الاصلي_بدون_امتداد>/vocals.wav
            demucs_output_dir = TEMP_FOLDER / "htdemucs_ft" / temp_audio_path.stem
            actual_vocals_path = demucs_output_dir / "vocals.wav"

            if not actual_vocals_path.exists():
                raise FileNotFoundError(f"Demucs did not produce vocals.wav at {actual_vocals_path}")

            # 3. إعادة دمج الفيديو الأصلي مع مسار الغناء فقط
            app.logger.info(f"Remuxing video with vocals only to {output_video_path}")
            subprocess.run([
                "ffmpeg", "-y",
                "-i", input_video_path,
                "-i", actual_vocals_path,
                "-map", "0:v:0",  # خذ مسار الفيديو من الملف الأصلي
                "-map", "1:a:0",  # خذ مسار الصوت (الغناء) من ملف Demucs
                "-c:v", "copy",   # لا تعيد ترميز الفيديو (أسرع)
                "-c:a", "aac",    # ترميز الصوت إلى AAC
                "-b:a", "192k",    # معدل بت الصوت
                "-shortest",      # لضمان عدم وجود صوت أطول من الفيديو
                output_video_path
            ], check=True, capture_output=True)

            # إرسال الملف المعالج
            return send_file(output_video_path, as_attachment=True, download_name=f"{Path(original_filename).stem}_nomusic.mp4")

        except subprocess.CalledProcessError as e:
            app.logger.error(f"FFmpeg or Demucs error: {e.stderr.decode()}")
            return jsonify({"error": f"Processing failed: {e.stderr.decode()}"}), 500
        except FileNotFoundError as e:
            app.logger.error(f"File not found error: {e}")
            return jsonify({"error": f"Processing failed: {e}"}), 500
        except Exception as e:
            app.logger.error(f"An unexpected error occurred: {e}")
            return jsonify({"error": f"An unexpected error occurred: {e}"}), 500
        finally:
            # تنظيف الملفات المؤقتة
            if input_video_path.exists():
                os.remove(input_video_path)
            if temp_audio_path.exists():
                os.remove(temp_audio_path)
            if demucs_output_dir.exists():
                shutil.rmtree(demucs_output_dir) # حذف مجلد demucs بالكامل

if __name__ == '__main__':
    app.run(debug=True)