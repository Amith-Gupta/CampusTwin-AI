FROM python:3.10-slim

WORKDIR /app

# Install system dependencies for OpenCV and image processing
RUN apt-get update && apt-get install -y --no-install-recommends \
    libgl1 \
    libglib2.0-0 \
    && rm -rf /var/lib/apt/lists/*

# Install Python requirements
COPY backend/requirements.txt requirements.txt
RUN pip install --no-cache-dir -r requirements.txt

# Copy source code and sample assets
COPY backend/ /app/backend/
COPY datasets/ /app/datasets/

ENV PORT=5000
ENV FLASK_ENV=production
EXPOSE 5000

WORKDIR /app/backend
CMD ["gunicorn", "--bind", "0.0.0.0:5000", "--workers", "1", "--threads", "4", "--timeout", "120", "app:app"]

