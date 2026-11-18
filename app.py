from flask import Flask, request, send_file, jsonify
from flask_cors import CORS
import os
import sys
import time
import subprocess
import shutil
from pathlib import Path
import uuid
from werkzeug.utils import secure_filename

# تحديد مسار ثابت للموديلات لتجنب مشاكل الصلاحيات على السيرفرات
MODELS_FOLDER = Path('models').resolve()
MODELS_FOLDER.mkdir(exist_ok=True)
os.environ.setdefault('TORCH_HOME', str(MODELS_FOLDER))

app = Flask(__name__, static_folder='.', static_url_path='')
CORS(app)

UPLOAD_FOLDER = Path('uploads')
PROCESSED_FOLDER = Path('processed')
TEMP_FOLDER = Path('temp_demucs_work')

UPLOAD_FOLDER.mkdir(exist_ok=True)
PROCESSED_FOLDER.mkdir(exist_ok=True)
TEMP_FOLDER.mkdir(exist_ok=True)


def cleanup_old_processed_files(max_age_seconds=3600):
    now = time.time()
    for item in PROCESSED_FOLDER.glob('*'):
        try:
            if item.is_file() and (now - item.stat().st_mtime) > max_age_seconds:
                item.unlink()
        except Exception:
            pass


@app.route('/')
def index():
    if Path('index.html').exists():
        return send_file('index.html')
    return jsonify({"status": "running", "service": "CN AI Music Remover API"})


@app.route('/health')
def health():
    return jsonify({
        "status": "ok",
        "ffmpeg": bool(shutil.which("ffmpeg")),
        "torch_home": os.environ.get('TORCH_HOME')
    })


@app.route('/process_video', methods=['POST'])
def process_video():
    cleanup_old_processed_files()

    if 'video' not in request.files:
        return jsonify({"error": "لم يتم إرسال أي ملف فيديو."}), 400

    file = request.files['video']
    if not file or file.filename == '':
        return jsonify({"error": "لم يتم اختيار ملف."}), 400

    if not shutil.which("ffmpeg"):
        return jsonify({"error": "أداة FFmpeg غير مثبتة على السيرفر."}), 500

    unique_id = uuid.uuid4().hex
    original_filename = file.filename
    file_extension = Path(original_filename).suffix or '.mp4'
    safe_stem = secure_filename(Path(original_filename).stem) or "video"

    input_video_path = UPLOAD_FOLDER / f"{unique_id}_original{file_extension}"
    temp_audio_path = TEMP_FOLDER / f"{unique_id}_audio.wav"
    model_name = "htdemucs"
    demucs_output_dir = TEMP_FOLDER / model_name / temp_audio_path.stem
    actual_vocals_path = demucs_output_dir / "vocals.wav"
    output_video_path = PROCESSED_FOLDER / f"{unique_id}_{safe_stem}_nomusic.mp4"

    file.save(input_video_path)

    try:
        # 1. استخراج الصوت من الفيديو
        app.logger.info(f"Extracting audio from {input_video_path}")
        subprocess.run([
            "ffmpeg", "-y", "-i", str(input_video_path),
            "-vn", "-acodec", "pcm_s16le", "-ar", "44100", "-ac", "2",
            str(temp_audio_path)
        ], check=True, capture_output=True)

        # 2. فصل الصوت البشري عن الموسيقى (htdemucs أسرع وأخف على الذاكرة)
        app.logger.info(f"Separating music using Demucs for {temp_audio_path}")
        subprocess.run([
            sys.executable, "-m", "demucs",
            "--two-stems=vocals",
            "-n", model_name,
            "-o", str(TEMP_FOLDER),
            "--shifts", "1",
            str(temp_audio_path)
        ], check=True, capture_output=True)

        if not actual_vocals_path.exists():
            raise FileNotFoundError("لم يتمكن Demucs من إنتاج ملف الصوت المعزول (vocals.wav).")

        # 3. دمج الفيديو الأصلي مع الصوت المعزول (مع بديل تلقائي إذا لم يقبل الفيديو النسخ المباشر)
        app.logger.info(f"Remuxing video with vocals only to {output_video_path}")
        try:
            subprocess.run([
                "ffmpeg", "-y",
                "-i", str(input_video_path),
                "-i", str(actual_vocals_path),
                "-map", "0:v:0",
                "-map", "1:a:0",
                "-c:v", "copy",
                "-c:a", "aac",
                "-b:a", "192k",
                "-shortest",
                str(output_video_path)
            ], check=True, capture_output=True)
        except subprocess.CalledProcessError:
            # في حال كانت صيغة الفيديو الأصلية (مثل WebM/VP9) لا تقبل copy داخل MP4
            subprocess.run([
                "ffmpeg", "-y",
                "-i", str(input_video_path),
                "-i", str(actual_vocals_path),
                "-map", "0:v:0",
                "-map", "1:a:0",
                "-c:v", "libx264",
                "-preset", "veryfast",
                "-crf", "23",
                "-c:a", "aac",
                "-b:a", "192k",
                "-shortest",
                str(output_video_path)
            ], check=True, capture_output=True)

        return send_file(
            output_video_path,
            as_attachment=True,
            download_name=f"{Path(original_filename).stem}_nomusic.mp4"
        )

    except subprocess.CalledProcessError as e:
        err_msg = e.stderr.decode(errors='replace') if e.stderr else str(e)
        app.logger.error(f"FFmpeg/Demucs error: {err_msg}")
        if "does not contain any stream" in err_msg or "Output file does not contain any stream" in err_msg:
            return jsonify({"error": "الفيديو المرفوع لا يحتوي على مسار صوتي."}), 400
        last_line = err_msg.strip().splitlines()[-1] if err_msg.strip() else "خطأ غير معروف"
        return jsonify({"error": f"فشل أثناء المعالجة: {last_line}"}), 500

    except FileNotFoundError as e:
        app.logger.error(f"File not found: {e}")
        return jsonify({"error": str(e)}), 500

    except Exception as e:
        app.logger.error(f"Unexpected error: {e}")
        return jsonify({"error": f"حدث خطأ غير متوقع: {str(e)}"}), 500

    finally:
        if input_video_path.exists():
            os.remove(input_video_path)
        if temp_audio_path.exists():
            os.remove(temp_audio_path)
        if demucs_output_dir.exists():
            shutil.rmtree(demucs_output_dir, ignore_errors=True)


if __name__ == '__main__':
    port = int(os.environ.get('PORT', 7860))
    app.run(host='0.0.0.0', port=port, debug=False)
