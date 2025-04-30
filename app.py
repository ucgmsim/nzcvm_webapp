import os
import subprocess
import tempfile
import zipfile

# Import jsonify and abort if not already explicitly imported at the top
from flask import Flask, request, send_file, jsonify, abort

app = Flask(__name__)

# --- Configuration ---
# Define the path to the NZCVM script within the container
NZCVM_SCRIPT_PATH = (
    "/usr/local/lib/python3.12/site-packages/velocity_modelling/scripts/nzcvm.py"
)


# --- Helper Functions ---
def create_config_file(config_data, directory):
    """Creates a temporary config file."""
    config_content = [f"{key}={value}" for key, value in config_data.items()]
    config_path = os.path.join(directory, "nzcvm.cfg")
    with open(config_path, "w") as f:
        f.write("\n".join(config_content))
    print(f"Generated config file at: {config_path}")
    return config_path


def run_nzcvm_process(config_path, output_dir):
    """Runs the NZCVM command using subprocess."""
    # Construct the actual command to run the NZCVM script
    command_args = [
        "python",
        NZCVM_SCRIPT_PATH,
        "generate-velocity-model",
        config_path,
        "--out-dir",
        output_dir,
    ]

    print(f"Running command: {' '.join(command_args)}")
    try:
        # TODO Make the timeout configurable for long runs.
        # Setting # 10 min (600 seconds) timeout for now
        result = subprocess.run(
            command_args, check=True, capture_output=True, text=True, timeout=600
        )
        print("NZCVM Process STDOUT:")
        print(result.stdout)
        print("NZCVM Process STDERR:")
        print(result.stderr)
        print("NZCVM process completed successfully.")
        return True
    except subprocess.CalledProcessError as e:
        print(f"NZCVM process failed with exit code {e.returncode}.")
        print("STDOUT:")
        print(e.stdout)
        print("STDERR:")
        print(e.stderr)
        return False
    except subprocess.TimeoutExpired as e:
        print("NZCVM process timed out.")
        print("STDOUT:")
        print(e.stdout)
        print("STDERR:")
        print(e.stderr)
        return False
    except Exception as e:
        print(f"An unexpected error occurred during subprocess execution: {e}")
        return False


def zip_output_files(directory_to_zip, zip_path):
    """Zips the contents of the specified directory."""
    print(f"Zipping contents of {directory_to_zip} into {zip_path}")
    with zipfile.ZipFile(zip_path, "w", zipfile.ZIP_DEFLATED) as zipf:
        for root, dirs, files in os.walk(directory_to_zip):
            for file in files:
                file_path = os.path.join(root, file)
                # archive_name is the name inside the zip file
                archive_name = os.path.relpath(file_path, directory_to_zip)
                print(f"Adding {file_path} as {archive_name}")
                zipf.write(file_path, arcname=archive_name)
    print("Zipping complete.")


# --- Flask Route ---
@app.route("/run-nzcvm", methods=["POST"])
def handle_run_nzcvm():
    """
    Receives configuration, runs NZCVM, zips output, and sends it back.
    """
    if not request.is_json:
        abort(400, description="Request must be JSON")

    config_data = request.get_json()
    print("Received config data:", config_data)

    # Ensure all fields required by the nzcvm.py script are present
    required_fields = [
        "MODEL_VERSION",
        "ORIGIN_LAT",
        "ORIGIN_LON",
        "ORIGIN_ROT",
        "EXTENT_X",
        "EXTENT_Y",
        "EXTENT_ZMAX",
        "EXTENT_ZMIN",
        "EXTENT_Z_SPACING",
        "EXTENT_LATLON_SPACING",
        "MIN_VS",
        "TOPO_TYPE",
        "OUTPUT_DIR",  # Although we override OUTPUT_DIR path below, check if it's sent
    ]
    if not all(field in config_data for field in required_fields):
        abort(400, description="Missing required configuration fields")

    # Use temporary directories for isolation and easy cleanup
    with tempfile.TemporaryDirectory() as temp_dir:
        # Define output dir within the temp dir for security/cleanup
        # The script will write into this directory inside the container
        output_dir = os.path.join(temp_dir, "nzcvm_output")
        os.makedirs(output_dir, exist_ok=True)  # Ensure output dir exists

        # Create the config file within the temp directory
        # Note: The OUTPUT_DIR value *in the config file* might be ignored by the script
        # when --out-dir is provided, but we create the file as sent by the frontend.
        config_path = create_config_file(config_data, temp_dir)

        print(
            f"Attempting to run NZCVM process. Config: {config_path}, Output directory: {output_dir}"
        )
        success = run_nzcvm_process(config_path, output_dir)

        if not success:
            # Use jsonify for error messages
            # Consider capturing and returning more specific errors from stderr if possible
            return (
                jsonify(
                    {"error": "NZCVM process failed. Check server logs for details."}
                ),
                500,
            )

        # Check if output directory has files before zipping
        if not os.listdir(output_dir):
            print(
                f"Warning: Output directory '{output_dir}' is empty after process execution."
            )
            return (
                jsonify(
                    {"error": "NZCVM process completed but produced no output files."}
                ),
                500,
            )

        # Create zip file path within the temp directory
        zip_filename = "nzcvm_output.zip"
        zip_path = os.path.join(temp_dir, zip_filename)

        try:
            zip_output_files(output_dir, zip_path)
        except Exception as e:
            print(f"Error during zipping: {e}")
            return jsonify({"error": f"Failed to zip output files: {e}"}), 500

        print(f"Sending zip file: {zip_path}")
        # Send the zip file back to the client
        return send_file(
            zip_path,
            mimetype="application/zip",
            as_attachment=True,
            download_name=zip_filename,
        )
