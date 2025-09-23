#!/bin/sh

# Generate outlines for all model versions as geojson.gz
# This needs to be run in this startup script rather than when building the Docker image
# because it requires the nzcvm_data directory which is only mounted as a volume when
# the container is started.
echo "Generating model outlines..."
python generate_model_outlines.py generate --path /usr/local/lib/python3.12/site-packages/velocity_modelling/

# Start the application
echo "Starting gunicorn..."
exec gunicorn --bind 0.0.0.0:5000 --workers 2 --timeout 3600 nzcvm_webapp.nzcvm_webapp_backend.app:app
