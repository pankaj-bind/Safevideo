# =============================================================================
# Safevideo Backend Dockerfile
# Production-ready Django container with FFmpeg support
# =============================================================================

FROM python:3.10-slim

# Prevent Python from buffering stdout/stderr
ENV PYTHONUNBUFFERED=1
ENV PYTHONDONTWRITEBYTECODE=1

# Set working directory
WORKDIR /app

# Install system dependencies including FFmpeg
RUN apt-get update && apt-get install -y --no-install-recommends \
    ffmpeg \
    libpq-dev \
    gcc \
    && rm -rf /var/lib/apt/lists/* \
    && apt-get clean

# Install Python dependencies
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy application code
COPY . .

# Create necessary directories
RUN mkdir -p /app/staticfiles /app/media

# Collect static files (for admin, DRF browsable API, etc.)
RUN SECRET_KEY=build-only python manage.py collectstatic --noinput 2>/dev/null || true

# Create non-root user for security
RUN useradd --create-home --shell /bin/bash appuser

# Set permissions BEFORE switching to appuser
RUN chown -R appuser:appuser /app \
    && chmod -R 755 /app \
    && touch /app/db.sqlite3 \
    && chmod 666 /app/db.sqlite3

# Switch to non-root user
USER appuser

# Expose port
EXPOSE 8000

# Entrypoint: Run migrations and start Gunicorn
CMD ["sh", "-c", "python manage.py migrate --noinput && gunicorn core.wsgi:application --bind 0.0.0.0:8000 --workers 3 --threads 2 --timeout 300"]
