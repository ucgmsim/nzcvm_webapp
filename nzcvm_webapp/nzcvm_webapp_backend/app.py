"""
End points for the NZCVM webapp backend.
"""

import logging
import re
import tempfile
from pathlib import Path

from flask import Flask, Response, abort, jsonify, request, send_file
from flask_cors import CORS

from nzcvm_webapp.nzcvm_webapp_backend import helpers

app = Flask(__name__)
CORS(app)  # Enable CORS for all routes

# Configure Flask for large file handling
app.config["MAX_CONTENT_LENGTH"] = 50 * 1024 * 1024  # 50MB max response
app.config["JSON_AS_ASCII"] = False  # Allow unicode in JSON responses

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
            geojson_filename = f"{version_name}_basins.geojson"
            geojson_path = GEOJSON_DIR / geojson_filename

            if geojson_path.exists():
                # Create a more descriptive display version
                # Convert version format (e.g., "2p03" -> "2.03", "2p03_nelson_only" -> "2.03 Nelson Only")
                if "_" in version_name:
                    # Split on underscore to get base version and descriptor
                    base_version, descriptor = version_name.split("_", 1)

                    # Convert base version format (e.g., "2p03" -> "2.03")
                    base_display = base_version.replace("p", ".")

                    # Format descriptor (replace underscores with spaces and title case)
                    formatted_descriptor = descriptor.replace("_", " ").title()
                    display_version = f"{base_display} {formatted_descriptor}"
                else:
                    # No descriptor, just convert base version
                    base_version = version_name  # Set base_version for versions without descriptors
                    display_version = base_version.replace("p", ".")

                model_versions.append(
                    {
                        "version": version_name,
                        "display_version": display_version,
                        "geojson_file": geojson_filename,
                        "yaml_file": yaml_path.name,
                        "base_version": base_version,
                    }
                )

        # Custom sorting function to sort by version number (descending) and then by descriptor presence
        def sort_key(model: dict[str, str]) -> tuple[int, int, int, str]:
            version_name = model["version"]

            # Extract base version number for primary sorting
            base_version = model["base_version"]
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

    except Exception as e:  # noqa: BLE001 # Catch-all for unexpected errors in API endpoint
        logger.error(f"Error listing model versions: {e}")
        return jsonify({"error": "Failed to list model versions"}), 500


@app.route("/geojson/list", methods=["GET"])
def list_geojson_files() -> Response:
    """List available GeoJSON files from the regional directory.

    Returns
    -------
    Response
        JSON response containing a list of available GeoJSON files.
    """
    try:
        if not GEOJSON_DIR.exists():
            return jsonify({"error": "GeoJSON directory not found"}), 404

        # Find basin GeoJSON files
        geojson_files = []
        for file_path in GEOJSON_DIR.glob("*basins.geojson"):
            geojson_files.append(file_path.name)

        return jsonify({"files": sorted(geojson_files, reverse=True)})

    except Exception as e:  # noqa: BLE001 # Catch-all for unexpected errors in API endpoint
        logger.error(f"Error listing GeoJSON files: {e}")
        return jsonify({"error": "Failed to list GeoJSON files"}), 500


@app.route("/geojson/<filename>", methods=["GET"])
def serve_geojson_file(filename: str) -> Response | tuple[Response, int]:
    """Serve a GeoJSON file from the regional directory.

    Parameters
    ----------
    filename : str
        The name of the GeoJSON file to serve (must be .geojson)

    Returns
    -------
    Response | tuple[Response, int]
        The GeoJSON data as JSON, or error response with status code.
    """
    try:
        logger.info(f"Serving GeoJSON file: {filename}")

        # Validate filename to prevent path traversal attacks
        if ".." in filename or "/" in filename:
            logger.warning(f"Invalid filename attempted: {filename}")
            return jsonify({"error": "Invalid filename"}), 400

        file_path = GEOJSON_DIR / filename
        logger.info(f"Looking for file at: {file_path}")

        if not file_path.exists():
            logger.error(f"File not found: {file_path}")
            return jsonify({"error": "File not found"}), 404

        if not filename.endswith(".geojson"):
            logger.warning(f"Invalid file extension: {filename}")
            return jsonify({"error": "File must be a .geojson file"}), 400

        # Serve the uncompressed GeoJSON file directly
        try:
            logger.info(f"Serving GeoJSON file: {file_path}")

            # Check file permissions and properties
            if file_path.exists():
                file_stat = file_path.stat()
                logger.info(f"File size: {file_stat.st_size} bytes")
                logger.info(f"File permissions: {oct(file_stat.st_mode)}")
                logger.info(f"File readable: {file_path.is_file()}")
            else:
                # List directory contents for debugging
                logger.info(f"Directory contents: {list(GEOJSON_DIR.glob('*'))}")
                return jsonify({"error": "File not found after existence check"}), 404

            # Read and serve the uncompressed GeoJSON file
            import json

            with open(file_path, "r", encoding="utf-8") as geojson_file:
                geojson_data = json.load(geojson_file)

            logger.info(
                f"Successfully loaded JSON with {len(geojson_data)} top-level keys"
            )

            # Create response
            response = jsonify(geojson_data)
            response.headers["Content-Type"] = "application/json"
            response.headers["Cache-Control"] = "public, max-age=3600"
            response.headers["X-Content-Source"] = "uncompressed"  # Debug header

            logger.info(f"Successfully serving JSON for {filename}")
            return response

        except (json.JSONDecodeError, UnicodeDecodeError) as e:
            logger.error(f"Error parsing file {filename}: {e}")
            return jsonify({"error": f"Invalid GeoJSON file format: {str(e)}"}), 400

        except PermissionError as e:
            logger.error(f"Permission denied reading file {filename}: {e}")
            return jsonify({"error": "Permission denied accessing file"}), 403
        except IOError as e:
            logger.error(f"IO error reading file {filename}: {e}")
            return jsonify({"error": "Error reading file"}), 500
        except Exception as e:
            logger.error(f"Unexpected error serving file {filename}: {e}")
            return jsonify({"error": f"Unexpected error: {str(e)}"}), 500

    except Exception as e:  # noqa: BLE001 # Catch-all for unexpected errors in API endpoint
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
        output_dir.mkdir()  # Ensure output dir exists

        # Create the config file within the temp directory
        config_path = helpers.create_config_file(config_data, temp_dir)

        logger.info(
            f"Attempting to run NZCVM process. Config: {config_path}, Output directory: {output_dir}"
        )
        try:
            helpers.run_nzcvm_process(config_path, output_dir)
        except Exception as e:  # noqa: BLE001 # Catch-all for unexpected errors in API endpoint
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
        _ = helpers.create_config_file(config_data, output_dir)

        # Create zip file path within the temp directory
        zip_filename = "nzcvm_output.zip"
        zip_path = temp_dir / zip_filename

        try:
            helpers.zip_output_files(output_dir, zip_path)
        except Exception as e:  # noqa: BLE001 # Catch-all for unexpected errors in API endpoint
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
