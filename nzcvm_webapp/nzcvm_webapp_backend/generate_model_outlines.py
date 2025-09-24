#!/usr/bin/env python3
"""
Script to generate GeoJSON basin outlines for model versions with optional simplification.

This script:
1. Reads YAML model version files to get lists of basins for each model version
2. Finds corresponding GeoJSON basin outline files in nzcvm_data/regional directory
3. Combines all GeoJSON files for each model version
4. Optionally simplifies geometries to reduce file size while preserving shape quality
5. Outputs combined GeoJSON files to generated_basin_geojsons/

Geometry Simplification:
The script includes advanced coordinate simplification using the Douglas-Peucker algorithm
and precision reduction to significantly reduce file sizes while maintaining visual quality:

- Douglas-Peucker simplification removes unnecessary coordinate points while preserving
  the essential shape characteristics of polygons and lines
- Coordinate precision reduction rounds coordinates to specified decimal places
- Default settings (tolerance=0.001, precision=5) provide ~1.1m accuracy
- Aggressive settings (tolerance=0.01, precision=3) can reduce file sizes by 70-90%
- Use --no-simplify to disable all simplification for maximum accuracy

Usage Examples:

Main Usage - Generate All Model Outline Files:
    python generate_model_outlines.py
    python generate_model_outlines.py generate
    python generate_model_outlines.py --path /path/to/velocity_modelling
    python generate_model_outlines.py generate --path /path/to/velocity_modelling

    This will process all YAML model version files, find GeoJSON basin outline files,
    combine all files for each model version, and create .geojson files
    in ../generated_basin_geojsons/

Simplification Options:
    python generate_model_outlines.py --tolerance 0.01 --precision 3
        Very aggressive simplification for smallest files (~111m accuracy)

    python generate_model_outlines.py --no-simplify
        Disable simplification for maximum accuracy (larger files)

    python generate_model_outlines.py --tolerance 0.005 --precision 4
        Moderate simplification (~11m accuracy)

Note: The path to the nzcvm_data directory does not need to be specified as it is taken from
the NZCVM_DATA_ROOT environment variable. The --path option specifies the path to the
velocity_modelling directory containing model_versions/ and generated_basin_geojsons/

Additional Commands:
    python generate_model_outlines.py compare file1.geojson file2.geojson
        Compare two GeoJSON files for differences, duplicates, and feature order

    python generate_model_outlines.py --help
        Show detailed help for all commands

    python generate_model_outlines.py --version
        Show version information

    --path / -p: Specify the path to the velocity_modelling directory containing
                 nzcvm_data/, model_versions/, and generated_basin_geojsons/ folders.
                 If not specified, defaults to the parent directory of the script.
"""

import gzip
import json
import os
from pathlib import Path
from typing import Any, Optional

import typer
import yaml

# Create the Typer app
app = typer.Typer(
    name="generate_model_outlines",
    help="Generate compressed GeoJSON basin outlines for velocity model versions.",
    add_completion=False,
)


def simplify_coordinates(
    coords: list[list[float]], tolerance: float = 0.001
) -> list[list[float]]:
    """
    Simplify coordinates using Douglas-Peucker algorithm.

    Parameters
    ----------
    coords : list[list[float]]
        List of [longitude, latitude] coordinate pairs
    tolerance : float, default=0.001
        Simplification tolerance (smaller = more detail, larger = more simplified)

    Returns
    -------
    list[list[float]]
        Simplified coordinate list
    """
    if len(coords) <= 2:
        return coords

    # Remove consecutive duplicate points to avoid division by zero
    cleaned_coords = []
    for i, coord in enumerate(coords):
        if i == 0 or coord != coords[i - 1]:
            cleaned_coords.append(coord)

    # If we removed too many points, return the cleaned list
    if len(cleaned_coords) <= 2:
        return cleaned_coords

    def perpendicular_distance(
        point: list[float], line_start: list[float], line_end: list[float]
    ) -> float:
        """Calculate perpendicular distance from point to line."""
        x0, y0 = point
        x1, y1 = line_start
        x2, y2 = line_end

        # Calculate the distance from point to line
        A = x2 - x1
        B = y2 - y1
        C = x1 * y2 - x2 * y1

        # Check if the line segment has zero length (start and end points are the same)
        denominator = A * A + B * B
        if denominator == 0:
            # Line segment has zero length, return distance to the point
            return ((x0 - x1) ** 2 + (y0 - y1) ** 2) ** 0.5

        distance = abs(A * y0 - B * x0 + C) / (denominator**0.5)
        return distance

    def douglas_peucker(
        coords_segment: list[list[float]], tolerance: float
    ) -> list[list[float]]:
        """Recursive Douglas-Peucker implementation."""
        if len(coords_segment) <= 2:
            return coords_segment

        # Find the point with maximum distance from the line between first and last points
        max_distance = 0
        max_index = 0

        for i in range(1, len(coords_segment) - 1):
            distance = perpendicular_distance(
                coords_segment[i], coords_segment[0], coords_segment[-1]
            )
            if distance > max_distance:
                max_distance = distance
                max_index = i

        # If the maximum distance is greater than tolerance, recursively simplify
        if max_distance > tolerance:
            # Recursively simplify the two segments
            left_segment = douglas_peucker(coords_segment[: max_index + 1], tolerance)
            right_segment = douglas_peucker(coords_segment[max_index:], tolerance)

            # Combine the results (remove duplicate point at connection)
            return left_segment[:-1] + right_segment
        else:
            # All points between first and last are within tolerance, return just endpoints
            return [coords_segment[0], coords_segment[-1]]

    return douglas_peucker(cleaned_coords, tolerance)


def reduce_precision(
    coords: list[list[float]], precision: int = 5
) -> list[list[float]]:
    """
    Reduce coordinate precision by rounding to specified decimal places.

    Parameters
    ----------
    coords : list[list[float]]
        List of [longitude, latitude] coordinate pairs
    precision : int, default=5
        Number of decimal places to round to (5 decimal places ≈ 1.1m accuracy)

    Returns
    -------
    list[list[float]]
        Coordinates with reduced precision
    """
    return [[round(coord, precision) for coord in point] for point in coords]


def simplify_geometry(
    geometry: dict[str, Any], tolerance: float = 0.001, precision: int = 5
) -> dict[str, Any]:
    """
    Simplify a GeoJSON geometry by reducing coordinates and precision.

    Parameters
    ----------
    geometry : dict[str, Any]
        GeoJSON geometry object
    tolerance : float, default=0.001
        Douglas-Peucker simplification tolerance
    precision : int, default=5
        Coordinate precision (decimal places)

    Returns
    -------
    dict[str, Any]
        Simplified geometry object
    """
    try:
        if geometry["type"] == "Polygon":
            simplified_coords = []
            for ring in geometry["coordinates"]:
                # Simplify the ring
                simplified_ring = simplify_coordinates(ring, tolerance)
                # Reduce precision
                simplified_ring = reduce_precision(simplified_ring, precision)
                # Ensure polygon is closed (first and last points are the same)
                if (
                    len(simplified_ring) > 0
                    and simplified_ring[0] != simplified_ring[-1]
                ):
                    simplified_ring.append(simplified_ring[0])
                simplified_coords.append(simplified_ring)

            return {"type": "Polygon", "coordinates": simplified_coords}

        elif geometry["type"] == "MultiPolygon":
            simplified_coords = []
            for polygon in geometry["coordinates"]:
                simplified_polygon = []
                for ring in polygon:
                    simplified_ring = simplify_coordinates(ring, tolerance)
                    simplified_ring = reduce_precision(simplified_ring, precision)
                    if (
                        len(simplified_ring) > 0
                        and simplified_ring[0] != simplified_ring[-1]
                    ):
                        simplified_ring.append(simplified_ring[0])
                    simplified_polygon.append(simplified_ring)
                simplified_coords.append(simplified_polygon)

            return {"type": "MultiPolygon", "coordinates": simplified_coords}

        elif geometry["type"] == "LineString":
            simplified_coords = simplify_coordinates(geometry["coordinates"], tolerance)
            simplified_coords = reduce_precision(simplified_coords, precision)

            return {"type": "LineString", "coordinates": simplified_coords}

        elif geometry["type"] == "MultiLineString":
            simplified_coords = []
            for line in geometry["coordinates"]:
                simplified_line = simplify_coordinates(line, tolerance)
                simplified_line = reduce_precision(simplified_line, precision)
                simplified_coords.append(simplified_line)

            return {"type": "MultiLineString", "coordinates": simplified_coords}

        else:
            # For Point, MultiPoint, or unknown types, just reduce precision
            if "coordinates" in geometry:
                if geometry["type"] == "Point":
                    geometry["coordinates"] = reduce_precision(
                        [geometry["coordinates"]], precision
                    )[0]
                elif geometry["type"] == "MultiPoint":
                    geometry["coordinates"] = reduce_precision(
                        geometry["coordinates"], precision
                    )

            return geometry

    except Exception as e:
        # If simplification fails, return the original geometry with just precision reduction
        print(
            f"Warning: Simplification failed for geometry type {geometry.get('type', 'unknown')}: {e}"
        )
        if "coordinates" in geometry:
            if geometry["type"] == "Polygon":
                simplified_coords = []
                for ring in geometry["coordinates"]:
                    simplified_ring = reduce_precision(ring, precision)
                    simplified_coords.append(simplified_ring)
                return {"type": "Polygon", "coordinates": simplified_coords}
            elif geometry["type"] == "MultiPolygon":
                simplified_coords = []
                for polygon in geometry["coordinates"]:
                    simplified_polygon = []
                    for ring in polygon:
                        simplified_ring = reduce_precision(ring, precision)
                        simplified_polygon.append(simplified_ring)
                    simplified_coords.append(simplified_polygon)
                return {"type": "MultiPolygon", "coordinates": simplified_coords}
            else:
                # For other types, just reduce precision
                geometry_copy = geometry.copy()
                if geometry["type"] == "Point":
                    geometry_copy["coordinates"] = reduce_precision(
                        [geometry["coordinates"]], precision
                    )[0]
                else:
                    geometry_copy["coordinates"] = reduce_precision(
                        geometry["coordinates"], precision
                    )
                return geometry_copy

        return geometry


def simplify_geojson_features(
    features: list[dict[str, Any]], tolerance: float = 0.001, precision: int = 5
) -> list[dict[str, Any]]:
    """
    Simplify all features in a GeoJSON feature list.

    Parameters
    ----------
    features : list[dict[str, Any]]
        List of GeoJSON features
    tolerance : float, default=0.001
        Douglas-Peucker simplification tolerance
    precision : int, default=5
        Coordinate precision (decimal places)

    Returns
    -------
    list[dict[str, Any]]
        List of simplified GeoJSON features
    """
    simplified_features = []

    for feature in features:
        simplified_feature = feature.copy()
        if "geometry" in feature and feature["geometry"]:
            simplified_feature["geometry"] = simplify_geometry(
                feature["geometry"], tolerance, precision
            )
        simplified_features.append(simplified_feature)

    return simplified_features


def find_model_version_files(model_versions_dir: str) -> list[str]:
    """
    Find all YAML files in the model_versions directory.

    Parameters
    ----------
    model_versions_dir : str
        Path to the directory containing model version YAML files.

    Returns
    -------
    list[str]
        Sorted list of absolute paths to YAML files found in the directory.
    """
    model_dir = Path(model_versions_dir)
    return sorted([str(f) for f in model_dir.glob("*.yaml")])


def read_yaml_model_version(yaml_file: str) -> list[str]:
    """
    Read a YAML model version file and extract basin names.

    Parameters
    ----------
    yaml_file : str
        Path to the YAML file containing model version configuration.

    Returns
    -------
    list[str]
        list of basin names extracted from the 'basins' key in the YAML file.
        Returns empty list if 'basins' key is not found.
    """
    with open(yaml_file, "r") as f:
        config = yaml.safe_load(f)

    basins = config.get("basins", [])
    return basins


def find_basin_files(basin_name: str, regional_dir: str) -> list[str]:
    """
    Find GeoJSON basin files for a given basin name in the regional directory.

    Strip version suffixes from basin names and return all .geojson files
    in the basin's subdirectory.

    Parameters
    ----------
    basin_name : str
        Name of the basin, potentially with version suffix (e.g., "basin_v19p1").
    regional_dir : str
        Path to the regional directory containing basin subdirectories.

    Returns
    -------
    list[str]
        Sorted list of paths to GeoJSON files found in the basin's subdirectory.
        Returns empty list if no files are found or the basin directory doesn't exist.
    """
    # Strip version suffix (e.g., "_v19p1", "_v21p8") from basin name
    clean_basin_name = basin_name
    if "_v" in basin_name:
        clean_basin_name = basin_name.split("_v")[0]

    # Get all .geojson files in the basin's subdirectory
    basin_dir = Path(regional_dir) / clean_basin_name
    if basin_dir.exists():
        found_files = [str(f) for f in basin_dir.glob("*.geojson")]
        return sorted(found_files)  # Sort for consistent ordering

    return []


def ensure_geojson_exists(file_path: str) -> Optional[str]:
    """
    Ensure a GeoJSON file exists and return its path.

    Parameters
    ----------
    file_path : str
        Path to the file to check.

    Returns
    -------
    Optional[str]
        The path to the GeoJSON file if it exists and has .geojson extension,
        None otherwise.

    Notes
    -----
    Prints warnings if the file doesn't exist or doesn't have .geojson extension.
    """
    if file_path.endswith(".geojson"):
        if Path(file_path).exists():
            return file_path
        else:
            print(f"Warning: GeoJSON file does not exist: {file_path}")
            return None
    else:
        print(f"Warning: File is not a GeoJSON file: {file_path}")
        return None


def combine_geojson_files(
    geojson_files: list[str],
    output_path: str,
    simplify: bool = True,
    tolerance: float = 0.001,
    precision: int = 5,
) -> None:
    """
    Combine multiple GeoJSON files into one with optional simplification.

    Parameters
    ----------
    geojson_files : list[str]
        list of paths to GeoJSON files to combine.
    output_path : str
        Path where the combined GeoJSON file will be written.
    simplify : bool, default=True
        Whether to apply coordinate simplification to reduce file size
    tolerance : float, default=0.001
        Douglas-Peucker simplification tolerance (smaller = more detail)
    precision : int, default=5
        Coordinate precision in decimal places (5 ≈ 1.1m accuracy)

    Raises
    ------
    RuntimeError
        If an error occurs during the combination process.
    """
    size_info = "with simplification" if simplify else "without simplification"
    print(
        f"Combining {len(geojson_files)} GeoJSON files into {output_path} {size_info}"
    )
    try:
        combine_geojson_inline(
            geojson_files, output_path, simplify, tolerance, precision
        )
    except Exception as e:  # noqa: BLE001 # Re-raise as RuntimeError for consistent error handling
        raise RuntimeError(f"Error combining GeoJSON files: {e}") from e


def compress_geojson(geojson_path: str) -> None:
    """
    Compress a GeoJSON file using gzip and delete the original.

    Parameters
    ----------
    geojson_path : str
        Path to the GeoJSON file to compress.

    Raises
    ------
    RuntimeError
        If an error occurs during compression or file deletion.
    """
    compressed_path = f"{geojson_path}.gz"

    print(f"Compressing {geojson_path} to {compressed_path}")
    try:
        with open(geojson_path, "rb") as f_in:
            with gzip.open(compressed_path, "wb") as f_out:
                f_out.writelines(f_in)
        print(f"Successfully created {compressed_path}")

        # Delete the original GeoJSON file after successful compression
        Path(geojson_path).unlink()
        print(f"Deleted original file {geojson_path}")
    except Exception as e:  # noqa: BLE001 # Re-raise as RuntimeError for consistent error handling
        raise RuntimeError(f"Error compressing {geojson_path}: {e}") from e


def process_model_version(
    yaml_file: str,
    regional_dir: str,
    output_dir: str,
    simplify: bool = True,
    tolerance: float = 0.001,
    precision: int = 5,
) -> None:
    """
    Process a single model version YAML file with optional simplification.

    Parameters
    ----------
    yaml_file : str
        Path to the YAML file containing model version configuration.
    regional_dir : str
        Path to the regional directory containing basin data.
    output_dir : str
        Path to the output directory for generated files.
    simplify : bool, default=True
        Whether to apply coordinate simplification
    tolerance : float, default=0.001
        Douglas-Peucker simplification tolerance
    precision : int, default=5
        Coordinate precision in decimal places

    Raises
    ------
    RuntimeError
        If no valid GeoJSON files are found or if processing fails.
    """
    print(f"\nProcessing {yaml_file}")

    # Extract version from filename
    yaml_path = Path(yaml_file)
    version_name = yaml_path.stem

    # Read the basin names from the YAML file
    basin_names = read_yaml_model_version(yaml_file)
    print(f"Found {len(basin_names)} basins in {version_name}: {basin_names}")

    # Find corresponding GeoJSON basin files
    valid_geojson_files = []
    for basin_name in basin_names:
        basin_files = find_basin_files(basin_name, regional_dir)
        if not basin_files:
            print(f"Warning: Could not find GeoJSON file for basin {basin_name}")
            continue

        for basin_file in basin_files:
            geojson_file = ensure_geojson_exists(basin_file)
            if geojson_file:
                valid_geojson_files.append(geojson_file)
                print(f"  Added: {Path(geojson_file).name}")
            else:
                print(
                    f"  Skipped: {Path(basin_file).name} - GeoJSON file not found or invalid"
                )

    if not valid_geojson_files:
        raise RuntimeError(f"No valid GeoJSON files found for {yaml_file}")

    print(f"Processing {len(valid_geojson_files)} valid GeoJSON files")

    # Define output paths in the dedicated output directory - keep as uncompressed JSON
    combined_geojson_path = str(Path(output_dir) / f"{version_name}_basins.geojson")

    # Combine all GeoJSON files with simplification
    combine_geojson_files(
        valid_geojson_files, combined_geojson_path, simplify, tolerance, precision
    )

    # Skip compression - keep files as .geojson for easier access
    print(f"Successfully processed {yaml_file} - output: {combined_geojson_path}")

    print(f"Successfully processed {yaml_file}")


def main(
    velocity_modelling_path: Optional[str] = None,
    simplify: bool = True,
    tolerance: float = 0.001,
    precision: int = 5,
) -> None:
    """
    Main function to process all model version files with optional simplification.

    Parameters
    ----------
    velocity_modelling_path : Optional[str], default=None
        Path to the velocity_modelling directory. If None, uses the parent
        directory of the script.
    simplify : bool, default=True
        Whether to apply coordinate simplification to reduce file size
    tolerance : float, default=0.001
        Douglas-Peucker simplification tolerance (smaller = more detail)
    precision : int, default=5
        Coordinate precision in decimal places (5 ≈ 1.1m accuracy)

    Raises
    ------
    typer.Exit
        If required directories are missing or if processing fails.
    """

    nzcvm_data_root = os.environ.get("NZCVM_DATA_ROOT")

    if not nzcvm_data_root:
        print("Error: NZCVM_DATA_ROOT environment variable is not set.")
        raise typer.Exit(1)
    regional_dir = Path(nzcvm_data_root) / "regional"

    # Get the directories
    if velocity_modelling_path:
        velocity_modelling_dir = Path(velocity_modelling_path).resolve()
        # Validate that the provided path contains expected directories
        if not velocity_modelling_dir.exists():
            print(f"Error: Provided path does not exist: {velocity_modelling_dir}")
            raise typer.Exit(1)

    else:
        script_path = Path(__file__).resolve()
        velocity_modelling_dir = script_path.parent.parent

    model_versions_dir = velocity_modelling_dir / "model_versions"

    # Create output directory for generated files
    output_dir = velocity_modelling_dir / "generated_basin_geojsons"
    output_dir.mkdir(exist_ok=True)
    print(f"Output directory: {output_dir}")

    if not model_versions_dir.exists():
        print(f"Error: Model versions directory not found: {model_versions_dir}")
        raise typer.Exit(1)

    if not regional_dir.exists():
        print(f"Error: Regional nzcvm_data directory not found: {regional_dir}")
        raise typer.Exit(1)

    print(f"Looking for YAML model version files in: {model_versions_dir}")
    print(f"Looking for basin nzcvm_data files in: {regional_dir}")

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
            process_model_version(
                model_file,
                str(regional_dir),
                str(output_dir),
                simplify,
                tolerance,
                precision,
            )
            success_count += 1
        except Exception as e:  # noqa: BLE001 # Catch all errors to continue processing other files
            print(f"Error processing {model_file}: {e}")

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


# Functions from combine_geojson.py
def write_geojson_to_file(geojson: dict[str, Any], output_file_path: str) -> None:
    """
    Write GeoJSON data to a file.

    Parameters
    ----------
    geojson : dict[str, Any]
        GeoJSON data structure to write.
    output_file_path : str
        Path where the GeoJSON file will be written.
    """
    with open(output_file_path, "w") as file:
        json.dump(geojson, file, indent=4)


def read_geojson(file_path: str) -> dict[str, Any]:
    """
    Read a GeoJSON file.

    Parameters
    ----------
    file_path : str
        Path to the GeoJSON file to read.

    Returns
    -------
    dict[str, Any]
        The loaded GeoJSON data structure.
    """
    with open(file_path, "r") as file:
        return json.load(file)


def combine_geojson_inline(
    files: list[str],
    output_path: str,
    simplify: bool = True,
    tolerance: float = 0.001,
    precision: int = 5,
) -> bool:
    """
    Combine multiple GeoJSON files into one with optional simplification.

    Parameters
    ----------
    files : list[str]
        list of paths to GeoJSON files to combine.
    output_path : str
        Path where the combined GeoJSON file will be written.
    simplify : bool, default=True
        Whether to apply coordinate simplification
    tolerance : float, default=0.001
        Douglas-Peucker simplification tolerance (lower = more detail)
    precision : int, default=5
        Coordinate precision in decimal places (5 ≈ 1.1m accuracy)

    Returns
    -------
    bool
        True if the combination was successful.

    Notes
    -----
    Groups files by parent directory and applies consistent styling to all features.
    Adds source file information to each feature's properties.
    Optionally simplifies geometries to reduce file size.
    """
    combined_features = []
    groups = {}
    for b in files:
        parent = Path(b).parent
        if parent in groups:
            groups[parent].append(b)
        else:
            groups[parent] = [b]

    print(f"Grouping files by directory: {groups}")
    if simplify:
        print(
            f"Applying simplification: tolerance={tolerance}, precision={precision} decimal places"
        )

    # Use a consistent color for all features
    color = {
        "stroke": "#ba0045",
        "fill": "#ba0045",
        "stroke-width": 1,
        "fill-opacity": 0.3,
    }

    for parent, group in groups.items():
        print(f"{parent} {color}")
        for file_path in group:
            geojson = read_geojson(file_path)
            for feature in geojson["features"]:
                feature["properties"].update(color)
                feature["properties"]["source_file"] = Path(file_path).name
                combined_features.append(feature)

    # Apply simplification if requested
    if simplify:
        print(f"Simplifying {len(combined_features)} features...")
        original_size = len(str(combined_features))
        combined_features = simplify_geojson_features(
            combined_features, tolerance, precision
        )
        simplified_size = len(str(combined_features))
        reduction = (1 - simplified_size / original_size) * 100
        print(f"Simplification reduced size by {reduction:.1f}%")

    combined_geojson = {"type": "FeatureCollection", "features": combined_features}

    # Write the combined GeoJSON
    write_geojson_to_file(combined_geojson, output_path)
    return True


# Functions from compare_geojson.py
def extract_feature_info(feature: dict[str, Any]) -> dict[str, Any]:
    """
    Extract key information from a feature for comparison.

    Parameters
    ----------
    feature : dict[str, Any]
        A GeoJSON feature object.

    Returns
    -------
    dict[str, Any]
        Dictionary containing extracted information with keys:
        - 'source_file': source file name
        - 'signature': tuple of first 3 coordinate pairs for identification
        - 'geometry_type': geometry type from the feature
    """
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


def check_internal_duplicates(
    feature_infos: list[dict[str, Any]], file_name: str
) -> None:
    """
    Check for duplicate features within a single file.

    Parameters
    ----------
    feature_infos : list[dict[str, Any]]
        list of feature information dictionaries from extract_feature_info.
    file_name : str
        Name of the file being checked (for display purposes).

    Notes
    -----
    Prints information about any duplicate features found.
    """
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


def compare_geojson_files(file1_path: str, file2_path: str) -> None:
    """
    Compare two GeoJSON files for duplicates and differences.

    Parameters
    ----------
    file1_path : str
        Path to the first GeoJSON file to compare.
    file2_path : str
        Path to the second GeoJSON file to compare.

    Notes
    -----
    Prints detailed comparison information including:
    - Feature counts
    - Source files in each file
    - Internal duplicates within each file
    - Differences between files
    """
    print("Comparing:")
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


def compare_feature_order(file1_path: str, file2_path: str) -> None:
    """
    Compare the order of features in two GeoJSON files.

    Parameters
    ----------
    file1_path : str
        Path to the first GeoJSON file to compare.
    file2_path : str
        Path to the second GeoJSON file to compare.

    Notes
    -----
    Prints detailed comparison of feature ordering including:
    - Feature counts
    - Order of source files
    - Whether orders are identical
    - Whether files contain the same set of features
    """
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
        print(f"  {i + 1:2d}: {source}")

    print("\nOrder in File 2:")
    for i, source in enumerate(order2):
        print(f"  {i + 1:2d}: {source}")

    # Check if orders are the same
    if order1 == order2:
        print("\n✅ Feature order is identical")
    else:
        print("\n❌ Feature order differs")

        # Find differences
        for i, (src1, src2) in enumerate(zip(order1, order2)):
            if src1 != src2:
                print(f"  Position {i + 1}: File1='{src1}', File2='{src2}'")

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


def run_comparison_mode(file1_path: str, file2_path: str) -> None:
    """
    Run comparison between two GeoJSON files.

    Parameters
    ----------
    file1_path : str
        Path to the first GeoJSON file to compare.
    file2_path : str
        Path to the second GeoJSON file to compare.

    Raises
    ------
    typer.Exit
        If one or both files are missing.
    """
    print("\n=== Running GeoJSON Comparison Mode ===")

    # Convert to Path objects and resolve
    file1 = Path(file1_path).resolve()
    file2 = Path(file2_path).resolve()

    print("Comparing files:")
    print(f"  File 1: {file1}")
    print(f"  File 2: {file2}")

    file1_exists = file1.exists()
    file2_exists = file2.exists()

    print(f"  File 1 exists: {'✓' if file1_exists else '✗'}")
    print(f"  File 2 exists: {'✓' if file2_exists else '✗'}")

    if file1_exists and file2_exists:
        print("\nComparing GeoJSON files...")
        compare_geojson_files(str(file1), str(file2))
        print("\n" + "=" * 50)
        compare_feature_order(str(file1), str(file2))
    else:
        print("\nCannot run comparison - one or both files are missing.")
        if not file1_exists:
            print(f"  Missing: {file1}")
        if not file2_exists:
            print(f"  Missing: {file2}")
        raise typer.Exit(1)


def compare_cmd(file1_path: str, file2_path: str) -> None:
    """
    Compare two GeoJSON files for differences and duplicates.

    Parameters
    ----------
    file1_path : str
        Path to the first GeoJSON file to compare.
    file2_path : str
        Path to the second GeoJSON file to compare.
    """
    run_comparison_mode(file1_path, file2_path)


@app.command("generate")
def generate_cmd(
    path: Optional[str] = typer.Option(
        None, "--path", "-p", help="Path to the velocity_modelling directory"
    ),
    simplify: bool = typer.Option(
        True,
        "--simplify/--no-simplify",
        help="Apply coordinate simplification to reduce file size",
    ),
    tolerance: float = typer.Option(
        0.001,
        "--tolerance",
        "-t",
        help="Simplification tolerance (smaller = more detail, larger = smaller files)",
    ),
    precision: int = typer.Option(
        5,
        "--precision",
        help="Coordinate precision in decimal places (5 ≈ 1.1m accuracy)",
    ),
):
    """
    Generate all model outline files (default command).

    This will process all YAML model version files, find basin outline files,
    convert txt files to GeoJSON if needed, combine all files for each model
    version, and create compressed .geojson.gz files.

    Simplification options can significantly reduce file sizes:
    - tolerance=0.001 (default): Good balance of size vs quality
    - tolerance=0.01: More aggressive simplification for smaller files
    - precision=5 (default): ~1.1m accuracy, good for web display
    - precision=4: ~11m accuracy, smaller files for overview maps
    """
    main(path, simplify, tolerance, precision)


@app.command("compare")
def compare_command(
    file1: str = typer.Argument(help="Path to the first GeoJSON file to compare"),
    file2: str = typer.Argument(help="Path to the second GeoJSON file to compare"),
):
    """Compare two GeoJSON files for differences, duplicates, and feature order."""
    run_comparison_mode(file1, file2)


@app.callback(invoke_without_command=True)
def main_callback(
    ctx: typer.Context,
    version: Optional[bool] = typer.Option(
        None, "--version", "-v", help="Show version and exit"
    ),
    path: Optional[str] = typer.Option(
        None, "--path", "-p", help="Path to the velocity_modelling directory"
    ),
    simplify: bool = typer.Option(
        True,
        "--simplify/--no-simplify",
        help="Apply coordinate simplification to reduce file size",
    ),
    tolerance: float = typer.Option(
        0.001,
        "--tolerance",
        "-t",
        help="Simplification tolerance (smaller = more detail)",
    ),
    precision: int = typer.Option(
        5, "--precision", help="Coordinate precision in decimal places"
    ),
):
    """
    Generate compressed GeoJSON basin outlines for model versions.

    If no command is specified, runs the default 'generate' command.

    Use --simplify to reduce file sizes while maintaining visual quality.
    """
    if version:
        print("generate_model_outlines.py version 1.1 - with coordinate simplification")
        raise typer.Exit()

    if ctx.invoked_subcommand is None:
        # Default behavior - run the generate command
        main(path, simplify, tolerance, precision)


if __name__ == "__main__":
    app()
