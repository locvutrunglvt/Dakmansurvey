FROM python:3.11-slim

WORKDIR /app

# Install openpyxl for Excel export
RUN pip install --no-cache-dir openpyxl

COPY . /app

EXPOSE 8080

CMD ["python", "server.py"]

