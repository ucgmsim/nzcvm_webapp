#!/usr/bin/env python3
"""
Script to generate compressed GeoJSON basin outlines for model versions.

This script:
1. Reads YAML model version files to get lists of basins for each model version
2. Finds corresponding basin outline files in data/regional directory
3. Converts any .txt coordinate files to GeoJSON if needed
4. Combines all GeoJSON files for each model version
5. Compresses the final combined GeoJSON file

Usage Examples:

Main Usage - Generate All Model Outline Files:
    python generate_model_outlines.py
    python generate_model_outlines.py generate
    python generate_model_outlines.py --path /path/to/velocity_modelling
    python generate_model_outlines.py generate --path /path/to/velocity_modelling

    This will process all YAML model version files, find basin outline files,
    convert txt files to GeoJSON if needed, combine all files for each model
    version, and create compressed .geojson.gz files in ../generated_basin_geojsons/

Additional Commands:
    python generate_model_outlines.py compare [--path /path/to/velocity_modelling]
        Compare generated vs existing files (specifically 2p07 basin files)

    python generate_model_outlines.py test
        Test txt-to-geojson conversion functionality using embedded test data

    python generate_model_outlines.py convert <file.txt>
        Convert a single txt coordinate file to GeoJSON format

    python generate_model_outlines.py --help
        Show detailed help for all commands

    python generate_model_outlines.py --version
        Show version information

    --path / -p: Specify the path to the velocity_modelling directory containing
                 data/, model_versions/, and generated_basin_geojsons/ folders.
                 If not specified, defaults to the parent directory of the script.

Expected Output Files:
    - 2p03_basins.geojson + 2p03_basins.geojson.gz
    - 2p07_basins.geojson + 2p07_basins.geojson.gz
    - 2p07_students2024_basins.geojson + 2p07_students2024_basins.geojson.gz
    - 2p03_nelson_only_basins.geojson + 2p03_nelson_only_basins.geojson.gz
"""

import os
import sys
import gzip
import json
import random
import yaml
from itertools import cycle
from pathlib import Path
from typing import Optional
import typer

# Create the Typer app
app = typer.Typer(
    name="generate_model_outlines",
    help="Generate compressed GeoJSON basin outlines for velocity model versions.",
    add_completion=False,
)


def find_model_version_files(model_versions_dir):
    """Find all YAML files in the model_versions directory."""
    model_dir = Path(model_versions_dir)
    model_files = []
    for file in model_dir.iterdir():
        if file.suffix == ".yaml":
            model_files.append(str(file))
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
    basin_dir = Path(regional_dir) / clean_basin_name
    if basin_dir.exists():
        for base_pattern in base_patterns:
            # Look for main file (without number suffix)
            # Prefer .geojson over .txt to avoid duplicates
            main_geojson = basin_dir / f"{base_pattern}.geojson"
            main_txt = basin_dir / f"{base_pattern}.txt"

            if main_geojson.exists():
                found_files.append(str(main_geojson))
            elif main_txt.exists():
                found_files.append(str(main_txt))

            # Look for numbered parts (_1, _2, _3, etc.)
            part_num = 1
            while True:
                part_geojson = basin_dir / f"{base_pattern}_{part_num}.geojson"
                part_txt = basin_dir / f"{base_pattern}_{part_num}.txt"

                if part_geojson.exists():
                    found_files.append(str(part_geojson))
                    part_num += 1
                elif part_txt.exists():
                    found_files.append(str(part_txt))
                    part_num += 1
                else:
                    break

        # If we found files in direct subdirectory, return them (no need to search elsewhere)
        if found_files:
            return found_files

    # If not found in direct subdirectory, try searching in all subdirectories
    regional_path = Path(regional_dir)
    for root_path in regional_path.rglob("*"):
        if not root_path.is_dir():
            continue
        # Skip the root directory we already checked
        if root_path == basin_dir:
            continue

        for base_pattern in base_patterns:
            # Look for main file - prefer .geojson over .txt
            geojson_file = root_path / f"{base_pattern}.geojson"
            txt_file = root_path / f"{base_pattern}.txt"

            if geojson_file.exists():
                file_path = str(geojson_file)
                if file_path not in found_files:
                    found_files.append(file_path)
            elif txt_file.exists():
                file_path = str(txt_file)
                if file_path not in found_files:
                    found_files.append(file_path)

            # Look for numbered parts - prefer .geojson over .txt
            part_num = 1
            while True:
                geojson_file = root_path / f"{base_pattern}_{part_num}.geojson"
                txt_file = root_path / f"{base_pattern}_{part_num}.txt"

                if geojson_file.exists():
                    file_path = str(geojson_file)
                    if file_path not in found_files:
                        found_files.append(file_path)
                    part_num += 1
                elif txt_file.exists():
                    file_path = str(txt_file)
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
        if Path(file_path).exists():
            return file_path
        else:
            print(f"Warning: GeoJSON file does not exist: {file_path}")
            return None

    elif file_path.endswith(".txt"):
        # Convert .txt to .geojson using inline function
        geojson_path = file_path.replace(".txt", ".geojson")

        try:
            print(f"Converting {file_path} to {geojson_path}")
            convert_txt_to_geojson(file_path, geojson_path)
            if Path(geojson_path).exists():
                return geojson_path
            else:
                print(f"Error: GeoJSON file was not created: {geojson_path}")
                return None
        except Exception as e:
            print(f"Error converting {file_path}: {e}")
            return None

    else:
        print(f"Warning: Unsupported file type: {file_path}")
        return None


def combine_geojson_files(geojson_files, output_path):
    """Combine multiple GeoJSON files into one using inline function."""
    try:
        print(f"Combining {len(geojson_files)} GeoJSON files into {output_path}")
        combine_geojson_inline(geojson_files, output_path)
        return True
    except Exception as e:
        print(f"Error combining GeoJSON files: {e}")
        return False


def compress_geojson(geojson_path):
    """Compress a GeoJSON file using gzip and delete the original."""
    compressed_path = f"{geojson_path}.gz"

    try:
        print(f"Compressing {geojson_path} to {compressed_path}")
        with open(geojson_path, "rb") as f_in:
            with gzip.open(compressed_path, "wb") as f_out:
                f_out.writelines(f_in)
        print(f"Successfully created {compressed_path}")

        # Delete the original GeoJSON file after successful compression
        Path(geojson_path).unlink()
        print(f"Deleted original file {geojson_path}")
        return True
    except Exception as e:
        print(f"Error compressing {geojson_path}: {e}")
        return False


def process_model_version(yaml_file, regional_dir, output_dir):
    """Process a single model version YAML file."""
    print(f"\nProcessing {yaml_file}")

    # Extract version from filename
    yaml_path = Path(yaml_file)
    version_name = yaml_path.stem

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
                print(f"  Added: {Path(geojson_file).name}")
            else:
                print(
                    f"  Skipped: {Path(basin_file).name} - could not create or find GeoJSON file"
                )

    if not valid_geojson_files:
        print(f"No valid GeoJSON files found for {yaml_file}")
        return False

    print(f"Processing {len(valid_geojson_files)} valid GeoJSON files")

    # Define output paths in the dedicated output directory
    combined_geojson_path = str(Path(output_dir) / f"{version_name}_basins.geojson")

    # Combine all GeoJSON files
    if not combine_geojson_files(valid_geojson_files, combined_geojson_path):
        return False

    # Compress the combined GeoJSON
    if not compress_geojson(combined_geojson_path):
        return False

    print(f"Successfully processed {yaml_file}")
    return True


def main(velocity_modelling_path: Optional[str] = None):
    """Main function to process all model version files."""
    # Get the directories
    if velocity_modelling_path:
        velocity_modelling_dir = Path(velocity_modelling_path).resolve()
        # Validate that the provided path contains expected directories
        if not velocity_modelling_dir.exists():
            print(f"Error: Provided path does not exist: {velocity_modelling_dir}")
            raise typer.Exit(1)

        expected_dirs = ["model_versions", "data", "generated_basin_geojsons"]
        missing_dirs = []
        for expected_dir in expected_dirs:
            if not (velocity_modelling_dir / expected_dir).exists():
                missing_dirs.append(expected_dir)

        if missing_dirs:
            print(
                f"Warning: The following expected directories are missing in {velocity_modelling_dir}:"
            )
            for missing_dir in missing_dirs:
                print(f"  - {missing_dir}")
            if "model_versions" in missing_dirs or "data" in missing_dirs:
                print(
                    "Error: Required directories 'model_versions' and/or 'data' are missing."
                )
                raise typer.Exit(1)
    else:
        script_path = Path(__file__).resolve()
        velocity_modelling_dir = script_path.parent.parent

    model_versions_dir = velocity_modelling_dir / "model_versions"
    regional_dir = velocity_modelling_dir / "data" / "regional"

    # Create output directory for generated files
    output_dir = velocity_modelling_dir / "generated_basin_geojsons"
    output_dir.mkdir(exist_ok=True)
    print(f"Output directory: {output_dir}")

    if not model_versions_dir.exists():
        print(f"Error: Model versions directory not found: {model_versions_dir}")
        raise typer.Exit(1)

    if not regional_dir.exists():
        print(f"Error: Regional data directory not found: {regional_dir}")
        raise typer.Exit(1)

    print(f"Looking for YAML model version files in: {model_versions_dir}")
    print(f"Looking for basin data files in: {regional_dir}")

    # Find all model version YAML files
    model_files = find_model_version_files(str(model_versions_dir))

    if not model_files:
        print("No model version YAML files found")
        raise typer.Exit(1)

    print(f"Found {len(model_files)} model version files to process:")
    for model_file in model_files:
        print(f"  - {Path(model_file).name}")

    # Process each model version file
    success_count = 0
    for model_file in model_files:
        try:
            if process_model_version(model_file, str(regional_dir), str(output_dir)):
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
        raise typer.Exit(1)


# Functions from basin_outline_to_geojson.py
def read_coordinates_from_file(file_path):
    """Read coordinates from a text file."""
    with open(file_path, "r") as file:
        lines = file.readlines()
    coordinates = []
    for line in lines:
        parts = line.strip().split()
        if len(parts) >= 2:
            longitude = float(parts[0])
            latitude = float(parts[1])
            coordinates.append([longitude, latitude])
    return coordinates


def create_geojson(coordinates):
    """Create a GeoJSON structure from coordinates."""
    geojson = {
        "type": "FeatureCollection",
        "features": [
            {
                "type": "Feature",
                "geometry": {"type": "Polygon", "coordinates": [coordinates]},
                "properties": {},
            }
        ],
    }
    return geojson


def write_geojson_to_file(geojson, output_file_path):
    """Write GeoJSON data to a file."""
    with open(output_file_path, "w") as file:
        json.dump(geojson, file, indent=4)


def convert_txt_to_geojson(input_file_path, output_file_path):
    """Convert a text coordinate file to GeoJSON format."""
    coordinates = read_coordinates_from_file(input_file_path)
    geojson = create_geojson(coordinates)
    write_geojson_to_file(geojson, output_file_path)
    return True


def standalone_basin_outline_conversion():
    """Standalone function for basin outline conversion (backward compatibility)."""
    if len(sys.argv) != 2:
        print(f"Usage: {sys.argv[0]} <input_file_path>")
        sys.exit(1)

    input_file_path = sys.argv[1]
    input_path = Path(input_file_path)
    if not input_path.is_file():
        print(f"Error: File '{input_file_path}' not found.")
        sys.exit(1)

    output_file_path = str(input_path.with_suffix(".geojson"))

    try:
        convert_txt_to_geojson(input_file_path, output_file_path)
        print(f"GeoJSON file created: {output_file_path}")
    except Exception as e:
        print(f"Error converting file: {e}")
        sys.exit(1)


# Functions from combine_geojson.py
def generate_colors(n):
    """Generate colors for GeoJSON features."""
    from matplotlib import cm

    cmap = cm.get_cmap("brg")  # You can choose different colormaps from matplotlib
    color_list = [cmap(random.random()) for _ in range(n)]
    colors = []
    for i in range(n):
        color = color_list[i]
        stroke = f"#{int(color[0] * 255):02x}{int(color[1] * 255):02x}{int(color[2] * 255):02x}"
        fill = f"#{int(color[0] * 255):02x}{int(color[1] * 255):02x}{int(color[2] * 255):02x}"
        colors.append(
            {"stroke": stroke, "fill": fill, "stroke-width": 1, "fill-opacity": 0.3}
        )
    return colors


def read_geojson(file_path):
    """Read a GeoJSON file."""
    with open(file_path, "r") as file:
        return json.load(file)


def combine_geojson_inline(files, output_path):
    """Combine multiple GeoJSON files into one."""
    combined_features = []
    groups = {}
    for b in files:
        parent = Path(b).parent
        if parent in groups:
            groups[parent].append(b)
        else:
            groups[parent] = [b]

    print(f"Grouping files by directory: {groups}")
    # Use a consistent color for all features
    color_text = "#ba0045"
    colors = [
        {
            "stroke": color_text,
            "fill": color_text,
            "stroke-width": 1,
            "fill-opacity": 0.3,
        }
    ] * len(groups)
    color_cycle = cycle(colors)

    for parent, group in groups.items():
        color = next(color_cycle)
        print(f"{parent} {color}")
        for file_path in group:
            geojson = read_geojson(file_path)
            for feature in geojson["features"]:
                feature["properties"].update(color)
                feature["properties"]["source_file"] = Path(file_path).name
                combined_features.append(feature)

    combined_geojson = {"type": "FeatureCollection", "features": combined_features}

    # Write the combined GeoJSON
    write_geojson_to_file(combined_geojson, output_path)
    return True


# Functions from compare_geojson.py
def extract_feature_info(feature):
    """Extract key information from a feature for comparison."""
    source_file = feature.get("properties", {}).get("source_file", "unknown")

    # Get first few coordinates to create a signature
    coords = feature.get("geometry", {}).get("coordinates", [])
    if coords and len(coords) > 0 and len(coords[0]) > 0:
        # Take first 3 coordinate pairs as signature
        signature = tuple(tuple(coord) for coord in coords[0][:3])
    else:
        signature = None

    return {
        "source_file": source_file,
        "signature": signature,
        "geometry_type": feature.get("geometry", {}).get("type", "unknown"),
    }


def check_internal_duplicates(feature_infos, file_name):
    """Check for duplicate features within a single file."""
    seen_signatures = {}
    duplicates = []

    for i, info in enumerate(feature_infos):
        signature = (info["source_file"], info["signature"])
        if signature in seen_signatures:
            duplicates.append(
                {
                    "source_file": info["source_file"],
                    "indices": [seen_signatures[signature], i],
                }
            )
        else:
            seen_signatures[signature] = i

    if duplicates:
        print(f"Found {len(duplicates)} duplicate features in {file_name}:")
        for dup in duplicates:
            print(f"  {dup['source_file']}: features at indices {dup['indices']}")
    else:
        print(f"No duplicate features found in {file_name}")
    print()


def compare_geojson_files(file1_path, file2_path):
    """Compare two GeoJSON files for duplicates and differences."""
    print(f"Comparing:")
    print(f"  File 1: {file1_path}")
    print(f"  File 2: {file2_path}")
    print()

    # Read both files
    geojson1 = read_geojson(file1_path)
    geojson2 = read_geojson(file2_path)

    features1 = geojson1.get("features", [])
    features2 = geojson2.get("features", [])

    print(f"File 1 has {len(features1)} features")
    print(f"File 2 has {len(features2)} features")
    print()

    # Extract feature information
    info1 = [extract_feature_info(f) for f in features1]
    info2 = [extract_feature_info(f) for f in features2]

    # Group by source file
    sources1 = {}
    sources2 = {}

    for info in info1:
        source = info["source_file"]
        if source not in sources1:
            sources1[source] = []
        sources1[source].append(info)

    for info in info2:
        source = info["source_file"]
        if source not in sources2:
            sources2[source] = []
        sources2[source].append(info)

    print("Source files in File 1:")
    for source in sorted(sources1.keys()):
        print(f"  {source}: {len(sources1[source])} features")
    print()

    print("Source files in File 2:")
    for source in sorted(sources2.keys()):
        print(f"  {source}: {len(sources2[source])} features")
    print()

    # Check for duplicates within each file
    print("=== Checking for duplicates within File 1 ===")
    check_internal_duplicates(info1, "File 1")

    print("=== Checking for duplicates within File 2 ===")
    check_internal_duplicates(info2, "File 2")

    # Check differences between files
    print("=== Comparing files ===")
    only_in_1 = set(sources1.keys()) - set(sources2.keys())
    only_in_2 = set(sources2.keys()) - set(sources1.keys())
    common = set(sources1.keys()) & set(sources2.keys())

    if only_in_1:
        print(f"Source files only in File 1: {sorted(only_in_1)}")
    if only_in_2:
        print(f"Source files only in File 2: {sorted(only_in_2)}")

    print(f"Common source files: {len(common)}")

    # Check for count differences in common files
    differences = []
    for source in common:
        count1 = len(sources1[source])
        count2 = len(sources2[source])
        if count1 != count2:
            differences.append(f"  {source}: File1={count1}, File2={count2}")

    if differences:
        print("Count differences in common source files:")
        for diff in differences:
            print(diff)
    else:
        print("All common source files have the same feature counts.")


def compare_feature_order(file1_path, file2_path):
    """Compare the order of features in two GeoJSON files."""
    # Read both files
    geojson1 = read_geojson(file1_path)
    geojson2 = read_geojson(file2_path)

    features1 = geojson1["features"]
    features2 = geojson2["features"]

    print(f"File 1: {len(features1)} features")
    print(f"File 2: {len(features2)} features")
    print()

    # Get order of source files
    order1 = [f["properties"]["source_file"] for f in features1]
    order2 = [f["properties"]["source_file"] for f in features2]

    print("Order in File 1:")
    for i, source in enumerate(order1):
        print(f"  {i+1:2d}: {source}")

    print("\nOrder in File 2:")
    for i, source in enumerate(order2):
        print(f"  {i+1:2d}: {source}")

    # Check if orders are the same
    if order1 == order2:
        print("\n✅ Feature order is identical")
    else:
        print("\n❌ Feature order differs")

        # Find differences
        for i, (src1, src2) in enumerate(zip(order1, order2)):
            if src1 != src2:
                print(f"  Position {i+1}: File1='{src1}', File2='{src2}'")

    # Check if they contain the same set of features (just in different order)
    set1 = set(order1)
    set2 = set(order2)

    if set1 == set2:
        print("\n✅ Both files contain the same set of features")
    else:
        only_1 = set1 - set2
        only_2 = set2 - set1

        if only_1:
            print(f"\n❌ Features only in File 1: {only_1}")
        if only_2:
            print(f"\n❌ Features only in File 2: {only_2}")


def create_test_coordinates_file(output_path):
    """Create a test coordinates file for testing txt-to-geojson conversion."""
    test_coordinates = """174.0 -41.5
174.1 -41.5
174.1 -41.4
174.0 -41.4
174.0 -41.5"""

    with open(output_path, "w") as f:
        f.write(test_coordinates)

    print(f"Created test coordinates file: {output_path}")
    return output_path


def test_txt_to_geojson_conversion():
    """Test the txt-to-geojson conversion functionality."""
    print("\n=== Testing txt-to-geojson conversion ===")

    # Create test coordinates file
    test_txt_path = Path(__file__).parent / "test_conversion.txt"
    test_geojson_path = test_txt_path.with_suffix(".geojson")

    try:
        # Create test file
        create_test_coordinates_file(str(test_txt_path))

        # Convert to GeoJSON
        print(f"Converting {test_txt_path} to {test_geojson_path}")
        convert_txt_to_geojson(str(test_txt_path), str(test_geojson_path))

        if test_geojson_path.exists():
            print("✅ Conversion successful")

            # Verify the content
            with open(test_geojson_path, "r") as f:
                geojson_content = json.load(f)

            features = geojson_content.get("features", [])
            if features and len(features) == 1:
                coords = features[0].get("geometry", {}).get("coordinates", [])
                if (
                    coords and len(coords) > 0 and len(coords[0]) == 5
                ):  # Should be 5 coordinate pairs
                    print("✅ GeoJSON structure is correct")
                    print(f"   Generated {len(coords[0])} coordinate pairs")
                else:
                    print("❌ GeoJSON structure is incorrect")
            else:
                print("❌ GeoJSON features are incorrect")
        else:
            print("❌ Conversion failed - file not created")

        # Cleanup test files
        if test_txt_path.exists():
            test_txt_path.unlink()
        if test_geojson_path.exists():
            test_geojson_path.unlink()

    except Exception as e:
        print(f"❌ Test failed: {e}")


def run_comparison_mode(velocity_modelling_path: Optional[str] = None):
    """Run comparison between existing and generated files."""
    print("\n=== Running GeoJSON Comparison Mode ===")

    # Get the directories
    if velocity_modelling_path:
        velocity_modelling_dir = Path(velocity_modelling_path).resolve()
        # Validate that the provided path exists
        if not velocity_modelling_dir.exists():
            print(f"Error: Provided path does not exist: {velocity_modelling_dir}")
            return
    else:
        script_path = Path(__file__).resolve()
        velocity_modelling_dir = script_path.parent.parent

    # Build paths for 2p07 files
    existing_file = (
        velocity_modelling_dir
        / "data"
        / "regional"
        / "model_version_2p07_basins.geojson"
    )
    generated_file = (
        velocity_modelling_dir / "generated_basin_geojsons" / "2p07_basins.geojson"
    )

    print(f"Looking for files:")
    print(f"  Existing: {existing_file}")
    print(f"  Generated: {generated_file}")

    existing_exists = existing_file.exists()
    generated_exists = generated_file.exists()

    print(f"  Existing file exists: {'✓' if existing_exists else '✗'}")
    print(f"  Generated file exists: {'✓' if generated_exists else '✗'}")

    if existing_exists and generated_exists:
        print("\nComparing 2p07 basin files...")
        compare_geojson_files(str(existing_file), str(generated_file))
        print("\n" + "=" * 50)
        compare_feature_order(str(existing_file), str(generated_file))
    else:
        print("\nCannot run comparison - one or both files are missing.")
        if not existing_exists:
            print(f"  Missing: {existing_file}")
        if not generated_exists:
            print(f"  Missing: {generated_file}")
            print(
                f"  Try running: python generate_model_outlines.py (to generate files first)"
            )


def convert_txt_to_geojson_cmd(input_file: str):
    """Convert a single txt coordinate file to GeoJSON format."""
    input_path = Path(input_file)
    if not input_path.is_file():
        print(f"Error: File '{input_file}' not found.")
        raise typer.Exit(1)

    output_file = str(input_path.with_suffix(".geojson"))
    try:
        convert_txt_to_geojson(input_file, output_file)
        print(f"GeoJSON file created: {output_file}")
    except Exception as e:
        print(f"Error converting file: {e}")
        raise typer.Exit(1)


def compare_cmd(velocity_modelling_path: Optional[str] = None):
    """Compare generated vs existing files (specifically 2p07 basin files)."""
    run_comparison_mode(velocity_modelling_path)


def test_cmd():
    """Test txt-to-geojson conversion functionality using embedded test data."""
    test_txt_to_geojson_conversion()


@app.command("generate")
def generate_cmd(
    path: Optional[str] = typer.Option(
        None, "--path", "-p", help="Path to the velocity_modelling directory"
    )
):
    """
    Generate all model outline files (default command).

    This will process all YAML model version files, find basin outline files,
    convert txt files to GeoJSON if needed, combine all files for each model
    version, and create compressed .geojson.gz files.
    """
    main(path)


@app.command("compare")
def compare_command(
    path: Optional[str] = typer.Option(
        None, "--path", "-p", help="Path to the velocity_modelling directory"
    )
):
    """Compare generated vs existing files (specifically 2p07 basin files)."""
    run_comparison_mode(path)


@app.command("test")
def test_command():
    """Test txt-to-geojson conversion functionality using embedded test data."""
    test_cmd()


@app.command("convert")
def convert_command(
    input_file: str = typer.Argument(..., help="Path to the txt file to convert")
):
    """Convert a single txt coordinate file to GeoJSON format."""
    convert_txt_to_geojson_cmd(input_file)


@app.callback(invoke_without_command=True)
def main_callback(
    ctx: typer.Context,
    version: Optional[bool] = typer.Option(
        None, "--version", "-v", help="Show version and exit"
    ),
    path: Optional[str] = typer.Option(
        None, "--path", "-p", help="Path to the velocity_modelling directory"
    ),
):
    """
    Generate compressed GeoJSON basin outlines for model versions.

    If no command is specified, runs the default 'generate' command.
    """
    if version:
        print("generate_model_outlines.py version 1.0")
        raise typer.Exit()

    if ctx.invoked_subcommand is None:
        # Default behavior - run the generate command
        main(path)


if __name__ == "__main__":
    app()
