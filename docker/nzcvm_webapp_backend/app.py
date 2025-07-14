"""
End points for the NZCVM webapp backend.
"""

import logging
import re
import tempfile
from pathlib import Path

from flask import Flask, Response, abort, jsonify, request, send_file
from flask_cors import CORS

# Import helper functions
from helpers import create_config_file, run_nzcvm_process, zip_output_files

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
                # Create a more descriptive display version
                # Convert version format (e.g., "2p03" -> "2.03", "2p03_nelson_only" -> "2.03 Nelson Only")
                if "_" in version_name:
                    # Split on underscore to get base version and descriptor
                    parts = version_name.split("_", 1)
                    base_version = parts[0]
                    descriptor = parts[1]

                    # Convert base version format (e.g., "2p03" -> "2.03")
                    version_match = re.match(r"(\d+)p(\d+)", base_version)
                    if version_match:
                        base_display = f"{version_match[1]}.{version_match[2]}"
                    else:
                        base_display = base_version

                    # Format descriptor (replace underscores with spaces and title case)
                    formatted_descriptor = descriptor.replace("_", " ").title()
                    display_version = f"{base_display} {formatted_descriptor}"
                else:
                    # No descriptor, just convert base version
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

        # Custom sorting function to sort by version number (descending) and then by descriptor presence
        def sort_key(model):
            version_name = model["version"]

            # Extract base version number for primary sorting
            base_version = (
                version_name.split("_")[0] if "_" in version_name else version_name
            )
            version_match = re.match(r"(\d+)p(\d+)", base_version)
            if version_match:
                # Convert to comparable format: higher numbers first
                major = int(version_match[1])
                minor = int(version_match[2])
                version_num = (major, minor)
            else:
                # Fallback for non-standard version formats
                version_num = (0, 0)

            # Secondary sort: models without descriptors first (0), then with descriptors (1)
            has_descriptor = 1 if "_" in version_name else 0

            # Tertiary sort: alphabetical by full version name for consistent ordering
            return (-version_num[0], -version_num[1], has_descriptor, version_name)

        return jsonify({"model_versions": sorted(model_versions, key=sort_key)})

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
