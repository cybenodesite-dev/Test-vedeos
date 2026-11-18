FROM python:3.10-slim

RUN apt-get update && apt-get install -y --no-install-recommends \
    ffmpeg \
    git \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

ENV TORCH_HOME=/app/models

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

RUN mkdir -p /app/models uploads processed temp_demucs_work && \
    python -c "import demucs.pretrained; demucs.pretrained.get_model('htdemucs')"

COPY app.py .

RUN chmod -R 777 /app

EXPOSE 7860

CMD ["gunicorn", "--bind", "0.0.0.0:7860", "--workers", "1", "--timeout", "600", "app:app"]
