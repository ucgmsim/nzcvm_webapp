# Use an official Python runtime as a parent image
FROM python:3.12-alpine

# Set the working directory in the container
WORKDIR /app

# Copy the requirements file and generate_model_outlines.py script into the container at /app
# The source path is relative to the build context defined in docker-compose.yml
COPY requirements.txt nzcvm_webapp/nzcvm_webapp_backend/generate_model_outlines.py /app/

RUN apk add --no-cache git llvm15-dev make g++ hdf5-dev gdal-dev
# Explicitly set the path to the llvm-config executable for the llvmlite build process.
# The llvmlite installation script searches for an executable named 'llvm-config' by default.
# However, the llvm15-dev package installs it as 'llvm-config-15' (to allow multiple versions).
# Setting this environment variable tells the build script the correct path, preventing a "not found" error.
ENV LLVM_CONFIG=/usr/bin/llvm-config-15
RUN  pip install --no-cache-dir git+https://github.com/ucgmsim/velocity_modelling#egg=velocity_modelling

# Generate outlines for all model versions as geojson.gz.
RUN python generate_model_outlines.py generate --path /usr/local/lib/python3.12/site-packages/velocity_modelling/

# Copy the entire nzcvm_webapp package source code
COPY . /tmp/nzcvm_webapp_src/

# Install the nzcvm_webapp package
RUN pip install --no-cache-dir /tmp/nzcvm_webapp_src/

# Install gunicorn outside of requirements.txt to pass deptry checks as it is not a
# direct dependency of the nzcvm_webapp package but it is required to run the Flask app
# in production.
RUN pip install gunicorn>=20.0

# Copy startup script and make it executable
COPY nzcvm_webapp/nzcvm_webapp_backend/startup.sh /app/startup.sh
RUN chmod +x /app/startup.sh

# Clean up the temporary source directory
RUN rm -rf /tmp/nzcvm_webapp_src

# Expose port 5000 for inter-container communication (Gunicorn listens here).
# This informs Docker the container uses this port; it does not publish
# the port to the host (that's done via 'ports' in docker-compose.yml).
EXPOSE 5000

# Define environment variable
ENV FLASK_APP=nzcvm_webapp.nzcvm_webapp_backend.app:app

# Use startup script to download data and start the application
CMD ["/app/startup.sh"]
