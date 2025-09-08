"""
Helper functions for NZCVM webapp backend.
"""

import logging
import zipfile
from pathlib import Path

# Import for direct call
from velocity_modelling.scripts.generate_3d_model import generate_3d_model

# Get logger
logger = logging.getLogger(__name__)


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
        generate_3d_model(
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
