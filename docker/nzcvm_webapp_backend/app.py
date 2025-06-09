import tempfile
import zipfile
from pathlib import Path
import logging
import re

from flask import Flask, request, send_file, jsonify, abort, Response
from flask_cors import CORS

# Import for direct call
from velocity_modelling.scripts.nzcvm import generate_velocity_model

app = Flask(__name__)
CORS(app)  # Enable CORS for all routes

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = app.logger

# --- Configuration ---
GEOJSON_DIR = Path(
    "/usr/local/lib/python3.12/site-packages/velocity_modelling/generated_basin_geojsons"
)
MODEL_VERSIONS_DIR = Path(
    "/usr/local/lib/python3.12/site-packages/velocity_modelling/model_versions"
)


# --- Helper Functions ---
def create_config_file(
    config_data: dict[str, str | float | int], directory: str | Path
) -> Path:
    """Creates a temporary config file from a dictionary.
    Assumes keys in config_data are already in the correct (uppercase) format.

    Parameters
    ----------
    config_data : dict[str, str | float | int]
        A dictionary containing configuration key-value pairs.
        Keys are expected to be uppercase strings representing configuration
        parameter names, and values can be strings, floats, or integers.
    directory : str | Path
        The path to the directory where the configuration file will be created.

    Raises
    ------
    OSError
        If there is an issue creating or writing to the config file.
    """
    config_content = [f"{key}={value}" for key, value in config_data.items()]
    config_path = Path(directory) / "nzcvm.cfg"
    with open(config_path, "w") as f:
        f.write("\n".join(config_content))
    logger.info(f"Generated config file at: {config_path}")
    logger.info("Config file content:")
    logger.info("\n".join(config_content))  # Log the actual content written
    return config_path


def run_nzcvm_process(config_path: Path, output_dir: Path) -> None:
    """Runs the NZCVM process by calling the library functions directly.

    Executes the NZCVM script to generate the velocity model based on
    the provided configuration file, directing output to the specified directory.

    Parameters
    ----------
    config_path : Path
        Path to the NZCVM configuration file. This file contains the
        parameters required by the NZCVM script.
    output_dir : Path
        Path to the directory where NZCVM output files should be saved.
        The script will write its generated files into this location.

    Returns
    -------
    None

    Raises
    ------
    Exception
        Re-raises exceptions from `generate_velocity_model` after logging them.
    """
    try:
        generate_velocity_model(
            nzcvm_cfg_path=config_path,
            out_dir=output_dir,
            output_format="HDF5",
        )
        logger.info("NZCVM process completed successfully via direct call.")
    except Exception as e:
        logger.error(f"NZCVM process failed during direct call: {e}")
        import traceback

        logger.error(traceback.format_exc())
        raise  # Re-raise the exception to let it bubble up


def zip_output_files(directory_to_zip: Path, zip_path: Path) -> None:
    """Zips the contents of the specified directory.

    Creates a zip archive containing all files within the given directory.

    Parameters
    ----------
    directory_to_zip : Path
        The path to the directory whose contents should be zipped.
        All files and subdirectories within this directory will be included
        in the zip archive.
    zip_path : Path
        The desired path for the output zip file, including the filename
        (e.g., '/path/to/archive.zip').

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
    logger.info(f"Zipping contents of {directory_to_zip} into {zip_path}")
    with zipfile.ZipFile(zip_path, "w", zipfile.ZIP_LZMA) as zipf:
        for file_path in directory_to_zip.rglob("*"):
            if file_path.is_file():
                # archive_name is the name inside the zip file
                archive_name = file_path.relative_to(directory_to_zip)
                logger.debug(f"Adding {file_path} as {archive_name}")
                zipf.write(file_path, arcname=archive_name)
    logger.info("Zipping complete.")


# --- Flask Route ---
@app.route("/model-versions/list", methods=["GET"])
def list_model_versions() -> Response:
    """List available model versions from YAML files in the model versions directory.

    Returns
    -------
    Response
        JSON response containing a list of available model versions with their
        corresponding GeoJSON files.
    """
    try:
        if not MODEL_VERSIONS_DIR.exists():
            return jsonify({"error": "Model versions directory not found"}), 404

        if not GEOJSON_DIR.exists():
            return jsonify({"error": "GeoJSON directory not found"}), 404

        # Find YAML model version files
        model_versions = []
        for yaml_path in MODEL_VERSIONS_DIR.glob("*.yaml"):
            # Extract version from filename (e.g., "2p03.yaml" -> "2p03")
            version_name = yaml_path.stem

            # Look for corresponding GeoJSON file
            geojson_filename = f"{version_name}_basins.geojson.gz"
            geojson_path = GEOJSON_DIR / geojson_filename

            if geojson_path.exists():
                # Convert version format (e.g., "2p03" -> "2.03")
                version_match = re.match(r"(\d+)p(\d+)", version_name)
                if version_match:
                    display_version = f"{version_match[1]}.{version_match[2]}"
                else:
                    display_version = version_name

                model_versions.append(
                    {
                        "version": version_name,
                        "display_version": display_version,
                        "geojson_file": geojson_filename,
                        "yaml_file": yaml_path.name,
                    }
                )

        return jsonify(
            {
                "model_versions": sorted(
                    model_versions, key=lambda x: x["version"], reverse=True
                )
            }
        )

    except Exception as e:
        logger.error(f"Error listing model versions: {e}")
        return jsonify({"error": "Failed to list model versions"}), 500


@app.route("/geojson/list", methods=["GET"])
def list_geojson_files() -> Response:
    """List available compressed GeoJSON files from the regional directory.

    Returns
    -------
    Response
        JSON response containing a list of available compressed GeoJSON files.
    """
    try:
        if not GEOJSON_DIR.exists():
            return jsonify({"error": "GeoJSON directory not found"}), 404

        # Find only compressed basin GeoJSON files
        geojson_files = []
        for file_path in GEOJSON_DIR.glob("*basins.geojson.gz"):
            geojson_files.append(file_path.name)

        return jsonify({"files": sorted(geojson_files, reverse=True)})

    except Exception as e:
        logger.error(f"Error listing GeoJSON files: {e}")
        return jsonify({"error": "Failed to list GeoJSON files"}), 500


@app.route("/geojson/<filename>", methods=["GET"])
def serve_geojson_file(filename: str) -> Response:
    """Serve a compressed GeoJSON file from the regional directory.

    Parameters
    ----------
    filename : str
        The name of the compressed GeoJSON file to serve (must be .geojson.gz)

    Returns
    -------
    Response
        The compressed GeoJSON data with appropriate headers.
    """
    try:
        # Validate filename to prevent path traversal attacks
        if ".." in filename or "/" in filename:
            return jsonify({"error": "Invalid filename"}), 400

        file_path = GEOJSON_DIR / filename

        if not file_path.exists():
            return jsonify({"error": "File not found"}), 404

        if not filename.endswith(".geojson.gz"):
            return jsonify({"error": "File must be a .geojson.gz file"}), 400

        # Send compressed file with gzip encoding header
        response = send_file(
            file_path,
            mimetype="application/json",
            as_attachment=False,
        )
        response.headers["Content-Encoding"] = "gzip"
        response.headers["Content-Type"] = "application/json"
        return response

    except Exception as e:
        logger.error(f"Error serving GeoJSON file {filename}: {e}")
        return jsonify({"error": "Failed to serve GeoJSON file"}), 500


@app.route("/run-nzcvm", methods=["POST"])
def handle_run_nzcvm() -> Response | tuple[Response, int]:
    """Flask route handler for running the NZCVM process.

    Receives configuration data as JSON from a POST request. It validates
    this data, then uses helper functions to create a configuration file,
    generates the velocity model, and zips the resulting output files.
    Finally, it sends this zip file back to the client as a downloadable
    attachment. If any step fails, it returns a JSON error response with an
    appropriate HTTP status code.

    The request body must be a JSON object containing the necessary
    configuration parameters for the NZCVM script. Refer to the
    `required_fields` list within the function for details on mandatory
    parameters.

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
    logger.info("Received config data:", config_data)

    # Ensure all fields required by the nzcvm.py script are present
    # Use UPPERCASE keys for consistency with the NZCVM script
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
        "EXTENT_LATLON_SPACING",
        "MIN_VS",
        "TOPO_TYPE",
    ]
    # Check for missing fields
    missing_fields = [field for field in required_fields if field not in config_data]
    if missing_fields:
        abort(
            400,
            description=f"Missing required configuration fields: {', '.join(missing_fields)}",
        )

    # Set OUTPUT_DIR to a fixed path - not exposed via API
    config_data["OUTPUT_DIR"] = "/tmp/nzcvm_output"

    # Use temporary directories for isolation and easy cleanup
    with tempfile.TemporaryDirectory() as temp_dir_str:
        temp_dir = Path(temp_dir_str)
        # Put the output directory inside the temp directory of the container
        output_dir = temp_dir / "nzcvm_output"
        output_dir.mkdir(parents=True, exist_ok=True)  # Ensure output dir exists

        # Create the config file within the temp directory
        config_path = create_config_file(config_data, temp_dir)

        logger.info(
            f"Attempting to run NZCVM process. Config: {config_path}, Output directory: {output_dir}"
        )
        try:
            run_nzcvm_process(config_path, output_dir)
        except Exception as e:
            logger.error(f"NZCVM process failed: {e}")
            return (
                jsonify(
                    {"error": "NZCVM process failed. Check server logs for details."}
                ),
                500,
            )

        # Check if the output directory has files before zipping
        if not any(output_dir.iterdir()):
            logger.warning(
                f"Output directory '{output_dir}' is empty after process execution."
            )
            return (
                jsonify(
                    {"error": "NZCVM process completed but produced no output files."}
                ),
                500,
            )

        # Create a copy of the config file the in the output directory so it is
        # included in the zip file for download
        _ = create_config_file(config_data, output_dir)

        # Create zip file path within the temp directory
        zip_filename = "nzcvm_output.zip"
        zip_path = temp_dir / zip_filename

        try:
            zip_output_files(output_dir, zip_path)
        except Exception as e:
            logger.error(f"Error during zipping: {e}")
            return jsonify({"error": f"Failed to zip output files: {e}"}), 500

        logger.info(f"Sending zip file: {zip_path}")

        # Send the zip file back to the client
        return send_file(
            zip_path,
            mimetype="application/zip",
            as_attachment=True,
            download_name=zip_filename,
        )
