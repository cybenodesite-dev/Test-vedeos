FROM python:3.10-slim

RUN apt-get update && apt-get install -y --no-install-recommends \
    ffmpeg \
    git \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

RUN python -c "import demucs.pretrained; demucs.pretrained.get_model('htdemucs_ft')"

COPY app.py .

RUN mkdir -p uploads processed temp_demucs_work && chmod -R 777 /app

EXPOSE 7860

CMD ["gunicorn", "--bind", "0.0.0.0:7860", "--timeout", "600", "app:app"]
