# Use an official Python runtime as a parent image
FROM python:3.12-alpine

# Set the working directory in the container
WORKDIR /app

# Copy the requirements file into the container at /app
# The source path is relative to the build context defined in docker-compose.yml
COPY docker/nzcvm_webapp_backend/requirements.txt /app/

RUN apk add --no-cache git llvm15-dev make g++ hdf5-dev
# Explicitly set the path to the llvm-config executable for the llvmlite build process.
# The llvmlite installation script searches for an executable named 'llvm-config' by default.
# However, the llvm15-dev package installs it as 'llvm-config-15' (to allow multiple versions).
# Setting this environment variable tells the build script the correct path, preventing a "not found" error.
ENV LLVM_CONFIG=/usr/bin/llvm-config-15
RUN  pip install --no-cache-dir git+https://github.com/ucgmsim/velocity_modelling@main#egg=velocity_modelling

# Install dependencies from requirements.txt (including Flask, Flask-CORS, Gunicorn)
RUN pip install --no-cache-dir -r requirements.txt

# Copy the Flask application file (app.py) into the container at /app
COPY docker/nzcvm_webapp_backend/app.py /app/

# Expose port 5000 for inter-container communication (Gunicorn listens here).
# This informs Docker the container uses this port; it does not publish
# the port to the host (that's done via 'ports' in docker-compose.yml).
EXPOSE 5000

# Define environment variable
ENV FLASK_APP=app.py


# Run app.py when the container launches using Gunicorn
# Gunicorn is a Python WSGI HTTP server for UNIX. It serves the Flask app in production.
# --bind 0.0.0.0:5000: Listen on all network interfaces within the container on port 5000
# --workers 3: Number of worker processes. Each worker handles requests independently so
# using 3 workers will allow the app to generate 3 different velocity models simultaneously.
# --timeout 600: Set worker timeout to 600 seconds (10 minutes)
# app:app: Look for the Flask app instance named 'app' in the 'app.py' module
CMD ["gunicorn", "--bind", "0.0.0.0:5000", "--workers", "3", "--timeout", "600", "app:app"]
