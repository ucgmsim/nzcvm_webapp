#!/usr/bin/env python3
"""
Script to process model version files and generate compressed GeoJSON basin outlines.

This script:
1. Reads YAML model version files to get lists of basins for each model version
2. Finds corresponding basin outline files in data/regional directory
3. Converts any .txt coordinate files to GeoJSON if needed
4. Combines all GeoJSON files for each model version
5. Compresses the final combined GeoJSON file

Usage: python process_model_versions.py
"""

import os
import sys
import gzip
import json
import subprocess
import tempfile
import yaml
from pathlib import Path


def find_model_version_files(model_versions_dir):
    """Find all YAML files in the model_versions directory."""
    model_files = []
    for file in os.listdir(model_versions_dir):
        if file.endswith(".yaml"):
            model_files.append(os.path.join(model_versions_dir, file))
    return sorted(model_files)


def read_yaml_model_version(yaml_file):
    """Read a YAML model version file and extract basin names."""
    with open(yaml_file, "r") as f:
        config = yaml.safe_load(f)

    basins = config.get("basins", [])
    return basins


def find_basin_files(basin_name, regional_dir):
    """
    Find basin files for a given basin name in the regional directory.
    Strip version suffixes from basin names when looking for files.
    Returns a list of file paths (including multi-part files), empty list if none found.
    Prioritizes .geojson files over .txt files to avoid duplicates.
    """
    # Strip version suffix (e.g., "_v19p1", "_v21p8") from basin name
    clean_basin_name = basin_name
    if "_v" in basin_name:
        clean_basin_name = basin_name.split("_v")[0]

    found_files = []

    # Try different file patterns
    base_patterns = [
        f"{clean_basin_name}_outline_WGS84",
        f"{clean_basin_name}",
    ]

    # First try in the direct subdirectory
    basin_dir = os.path.join(regional_dir, clean_basin_name)
    if os.path.exists(basin_dir):
        for base_pattern in base_patterns:
            # Look for main file (without number suffix)
            # Prefer .geojson over .txt to avoid duplicates
            main_geojson = os.path.join(basin_dir, f"{base_pattern}.geojson")
            main_txt = os.path.join(basin_dir, f"{base_pattern}.txt")
            
            if os.path.exists(main_geojson):
                found_files.append(main_geojson)
            elif os.path.exists(main_txt):
                found_files.append(main_txt)

            # Look for numbered parts (_1, _2, _3, etc.)
            part_num = 1
            while True:
                part_geojson = os.path.join(basin_dir, f"{base_pattern}_{part_num}.geojson")
                part_txt = os.path.join(basin_dir, f"{base_pattern}_{part_num}.txt")
                
                if os.path.exists(part_geojson):
                    found_files.append(part_geojson)
                    part_num += 1
                elif os.path.exists(part_txt):
                    found_files.append(part_txt)
                    part_num += 1
                else:
                    break

        # If we found files in direct subdirectory, return them (no need to search elsewhere)
        if found_files:
            return found_files

    # If not found in direct subdirectory, try searching in all subdirectories
    for root, dirs, files in os.walk(regional_dir):
        # Skip the root directory we already checked
        if root == basin_dir:
            continue

        for base_pattern in base_patterns:
            # Look for main file - prefer .geojson over .txt
            geojson_filename = f"{base_pattern}.geojson"
            txt_filename = f"{base_pattern}.txt"
            
            if geojson_filename in files:
                file_path = os.path.join(root, geojson_filename)
                if file_path not in found_files:
                    found_files.append(file_path)
            elif txt_filename in files:
                file_path = os.path.join(root, txt_filename)
                if file_path not in found_files:
                    found_files.append(file_path)

            # Look for numbered parts - prefer .geojson over .txt
            part_num = 1
            while True:
                geojson_filename = f"{base_pattern}_{part_num}.geojson"
                txt_filename = f"{base_pattern}_{part_num}.txt"
                
                if geojson_filename in files:
                    file_path = os.path.join(root, geojson_filename)
                    if file_path not in found_files:
                        found_files.append(file_path)
                    part_num += 1
                elif txt_filename in files:
                    file_path = os.path.join(root, txt_filename)
                    if file_path not in found_files:
                        found_files.append(file_path)
                    part_num += 1
                else:
                    break

    return found_files


def ensure_geojson_exists(file_path):
    """
    Ensure a GeoJSON file exists. If the file is a .txt file, convert it to GeoJSON.
    Always regenerate GeoJSON from txt files to ensure fresh data.
    Returns the path to the GeoJSON file if successful, None otherwise.
    """
    if file_path.endswith(".geojson"):
        if os.path.exists(file_path):
            return file_path
        else:
            print(f"Warning: GeoJSON file does not exist: {file_path}")
            return None

    elif file_path.endswith(".txt"):
        # Convert .txt to .geojson using basin_outline_to_geojson.py
        geojson_path = file_path.replace(".txt", ".geojson")

        # Always regenerate from txt file to ensure fresh data
        tools_dir = os.path.dirname(os.path.abspath(__file__))
        basin_script = os.path.join(tools_dir, "basin_outline_to_geojson.py")

        try:
            print(f"Converting {file_path} to {geojson_path}")
            subprocess.run([sys.executable, basin_script, file_path], check=True)
            if os.path.exists(geojson_path):
                return geojson_path
            else:
                print(f"Error: GeoJSON file was not created: {geojson_path}")
                return None
        except subprocess.CalledProcessError as e:
            print(f"Error converting {file_path}: {e}")
            return None

    else:
        print(f"Warning: Unsupported file type: {file_path}")
        return None


def create_file_list_for_combine(geojson_files, temp_dir):
    """Create a temporary file list for the combine_geojson.py script."""
    file_list_path = os.path.join(temp_dir, "geojson_files.txt")

    with open(file_list_path, "w") as f:
        for geojson_file in geojson_files:
            f.write(f"{geojson_file}\n")

    return file_list_path


def combine_geojson_files(geojson_files, output_path):
    """Combine multiple GeoJSON files into one using combine_geojson.py."""
    tools_dir = os.path.dirname(os.path.abspath(__file__))
    combine_script = os.path.join(tools_dir, "combine_geojson.py")

    with tempfile.TemporaryDirectory() as temp_dir:
        # Create file list for combine script
        file_list_path = create_file_list_for_combine(geojson_files, temp_dir)

        try:
            print(f"Combining {len(geojson_files)} GeoJSON files into {output_path}")
            subprocess.run(
                [sys.executable, combine_script, file_list_path, output_path],
                check=True,
            )
            return True
        except subprocess.CalledProcessError as e:
            print(f"Error combining GeoJSON files: {e}")
            return False


def compress_geojson(geojson_path):
    """Compress a GeoJSON file using gzip."""
    compressed_path = f"{geojson_path}.gz"

    try:
        print(f"Compressing {geojson_path} to {compressed_path}")
        with open(geojson_path, "rb") as f_in:
            with gzip.open(compressed_path, "wb") as f_out:
                f_out.writelines(f_in)
        print(f"Successfully created {compressed_path}")
        return True
    except Exception as e:
        print(f"Error compressing {geojson_path}: {e}")
        return False


def process_model_version(yaml_file, regional_dir, output_dir):
    """Process a single model version YAML file."""
    print(f"\nProcessing {yaml_file}")

    # Extract version from filename
    base_name = os.path.basename(yaml_file)
    version_name = base_name.replace(".yaml", "")

    # Read the basin names from the YAML file
    basin_names = read_yaml_model_version(yaml_file)
    print(f"Found {len(basin_names)} basins in {version_name}: {basin_names}")

    # Find corresponding basin files and ensure they're GeoJSON
    valid_geojson_files = []
    for basin_name in basin_names:
        basin_files = find_basin_files(basin_name, regional_dir)
        if not basin_files:
            print(f"Warning: Could not find file for basin {basin_name}")
            continue

        for basin_file in basin_files:
            geojson_file = ensure_geojson_exists(basin_file)
            if geojson_file:
                valid_geojson_files.append(geojson_file)
                print(f"  Added: {os.path.basename(geojson_file)}")
            else:
                print(
                    f"  Skipped: {os.path.basename(basin_file)} - could not create or find GeoJSON file"
                )

    if not valid_geojson_files:
        print(f"No valid GeoJSON files found for {yaml_file}")
        return False

    print(f"Processing {len(valid_geojson_files)} valid GeoJSON files")

    # Define output paths in the dedicated output directory
    combined_geojson_path = os.path.join(output_dir, f"{version_name}_basins.geojson")

    # Combine all GeoJSON files
    if not combine_geojson_files(valid_geojson_files, combined_geojson_path):
        return False

    # Compress the combined GeoJSON
    if not compress_geojson(combined_geojson_path):
        return False

    print(f"Successfully processed {yaml_file}")
    return True


def main():
    """Main function to process all model version files."""
    # Get the directories
    script_dir = os.path.dirname(os.path.abspath(__file__))
    velocity_modelling_dir = os.path.dirname(script_dir)

    model_versions_dir = os.path.join(velocity_modelling_dir, "model_versions")
    regional_dir = os.path.join(velocity_modelling_dir, "data", "regional")

    # Create output directory for generated files
    output_dir = os.path.join(velocity_modelling_dir, "generated_basin_geojsons")
    os.makedirs(output_dir, exist_ok=True)
    print(f"Output directory: {output_dir}")

    if not os.path.exists(model_versions_dir):
        print(f"Error: Model versions directory not found: {model_versions_dir}")
        sys.exit(1)

    if not os.path.exists(regional_dir):
        print(f"Error: Regional data directory not found: {regional_dir}")
        sys.exit(1)

    print(f"Looking for YAML model version files in: {model_versions_dir}")
    print(f"Looking for basin data files in: {regional_dir}")

    # Find all model version YAML files
    model_files = find_model_version_files(model_versions_dir)

    if not model_files:
        print("No model version YAML files found")
        sys.exit(1)

    print(f"Found {len(model_files)} model version files to process:")
    for model_file in model_files:
        print(f"  - {os.path.basename(model_file)}")

    # Process each model version file
    success_count = 0
    for model_file in model_files:
        try:
            if process_model_version(model_file, regional_dir, output_dir):
                success_count += 1
        except Exception as e:
            print(f"Unexpected error processing {model_file}: {e}")

    print(
        f"\nProcessing complete: {success_count}/{len(model_files)} files processed successfully"
    )

    if success_count == len(model_files):
        print("All model versions processed successfully!")
        print(f"Generated files are in: {output_dir}")
    else:
        print(
            "Some model versions failed to process. Check the output above for details."
        )
        sys.exit(1)


if __name__ == "__main__":
    main()
