#!/bin/sh

# Download NZCVM data
echo "Downloading NZCVM data..."
python -c "
from velocity_modelling.tools.download_data import main
main()
print('Data download completed.')
"

# Start the application
echo "Starting gunicorn..."
exec gunicorn --bind 0.0.0.0:5000 --workers 3 --timeout 3600 nzcvm_webapp.nzcvm_webapp_backend.app:app
