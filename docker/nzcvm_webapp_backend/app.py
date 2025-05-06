import os
import subprocess
import tempfile
import zipfile
import shutil  # Add this import
from typing import Dict, Tuple, Union

# Import jsonify and abort if not already explicitly imported at the top
from flask import Flask, request, send_file, jsonify, abort, Response

app = Flask(__name__)

# --- Configuration ---
# Define the path to the NZCVM script within the container
NZCVM_SCRIPT_PATH = (
    "/usr/local/lib/python3.12/site-packages/velocity_modelling/scripts/nzcvm.py"
)


# --- Helper Functions ---
def create_config_file(
    config_data: Dict[str, Union[str, float, int]], directory: str
) -> str:
    """Creates a temporary config file from a dictionary.
    Assumes keys in config_data are already in the correct (uppercase) format.

    Raises
    ------
    OSError
        If there is an issue creating or writing to the config file.
    """
    config_content = [f"{key}={value}" for key, value in config_data.items()]
    config_path = os.path.join(directory, "nzcvm.cfg")
    with open(config_path, "w") as f:
        f.write("\n".join(config_content))
    print(f"Generated config file at: {config_path}")
    print("Config file content:")
    print("\n".join(config_content))  # Log the actual content written
    return config_path


def run_nzcvm_process(config_path: str, output_dir: str) -> bool:
    """Runs the NZCVM command using subprocess.

    Executes the NZCVM script to generate the velocity model based on
    the provided configuration file, directing output to the specified directory.

    Parameters
    ----------
    config_path : str
        Path to the NZCVM configuration file.
    output_dir : str
        Path to the directory where NZCVM output files should be saved.

    Returns
    -------
    bool
        True if the NZCVM process completed successfully, False otherwise.

    Raises
    ------
    FileNotFoundError
        If the NZCVM script or python interpreter is not found.
    subprocess.CalledProcessError
        If the NZCVM script returns a non-zero exit code.
    subprocess.TimeoutExpired
        If the NZCVM script execution exceeds the timeout.
    """
    # Construct the actual command to run the NZCVM script
    command_args = [
        "python",
        NZCVM_SCRIPT_PATH,
        "generate-velocity-model",
        config_path,
        "--out-dir",
        output_dir,
        "--output-format",
        "HDF5",
    ]

    print(f"Running command: {' '.join(command_args)}")
    try:
        # Setting 10 min (600 seconds) timeout
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


def zip_output_files(directory_to_zip: str, zip_path: str) -> None:
    """Zips the contents of the specified directory.

    Creates a zip archive containing all files within the given directory.

    Parameters
    ----------
    directory_to_zip : str
        The path to the directory whose contents should be zipped.
    zip_path : str
        The desired path for the output zip file.

    Returns
    -------
    None

    Raises
    ------
    OSError
        If there is an issue accessing the directory to zip or writing the zip file.
    zipfile.BadZipFile
        If there is an issue with the zip file format during creation (unlikely for 'w' mode).
    zipfile.LargeZipFile
        If a file in the directory exceeds ZIP file size limits and allowZip64 is False (default is True).
    """
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
def handle_run_nzcvm() -> Union[Response, Tuple[Response, int]]:
    """Flask route handler for running the NZCVM process.

    Receives configuration data as JSON, validates it, runs the NZCVM script
    in a subprocess, zips the output files, and sends the zip file back
    to the client as an attachment. Handles errors during the process.

    Returns
    -------
    Union[Response, Tuple[Response, int]]
        A Flask Response object containing the zip file for download,
        or a JSON error response with an appropriate HTTP status code.

    Raises
    ------
    werkzeug.exceptions.HTTPException
        (Specifically 400 BadRequest) If the request is not JSON or if
        required configuration fields are missing.
        Note: Other exceptions from helper functions are caught and typically
        result in a 500 Internal Server Error response rather than being
        raised directly from this handler.
    """
    if not request.is_json:
        abort(400, description="Request must be JSON")

    config_data = request.get_json()
    print("Received config data:", config_data)

    # Ensure all fields required by the nzcvm.py script are present
    # Use UPPERCASE keys to match what apiClient.js now sends
    required_fields = [
        "CALL_TYPE",
        "MODEL_VERSION",
        "ORIGIN_LAT",
        "ORIGIN_LON",
        "ORIGIN_ROT",
        "EXTENT_X",
        "EXTENT_Y",
        "EXTENT_ZMAX",
        "EXTENT_ZMIN",
        "EXTENT_Z_SPACING",
        "EXTENT_LATLON_SPACING",  # Key expected by nzcvm.py config
        "MIN_VS",
        "TOPO_TYPE",
        "OUTPUT_DIR",
    ]
    # Check for missing fields using UPPERCASE keys from the received JSON
    missing_fields = [field for field in required_fields if field not in config_data]
    if missing_fields:
        abort(
            400,
            description=f"Missing required configuration fields: {', '.join(missing_fields)}",
        )

    # Use temporary directories for isolation and easy cleanup
    with tempfile.TemporaryDirectory() as temp_dir:
        # Put the output directory inside the temp directory of the container
        output_dir = os.path.join(temp_dir, "nzcvm_output")
        os.makedirs(output_dir, exist_ok=True)  # Ensure output dir exists

        # Create the config file within the temp directory
        # Pass the original config_data (now with uppercase keys)
        config_path = create_config_file(config_data, temp_dir)

        print(
            f"Attempting to run NZCVM process. Config: {config_path}, Output directory: {output_dir}"
        )
        success = run_nzcvm_process(config_path, output_dir)

        if not success:
            return (
                jsonify(
                    {"error": "NZCVM process failed. Check server logs for details."}
                ),
                500,
            )

        # Copy the config file to the output directory to be included in the zip
        try:
            config_filename = os.path.basename(config_path)
            dest_config_path = os.path.join(output_dir, config_filename)
            shutil.copy(config_path, dest_config_path)
            print(f"Copied config file to {dest_config_path}")
        except Exception as e:
            print(f"Error copying config file to output directory: {e}")

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
