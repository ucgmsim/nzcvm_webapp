# Test Conversion - NZCVM Webapp

This test page (`test_conversion.html`) validates the conversion from kilometers to degrees for grid spacing calculations in the NZCVM webapp.

## Purpose

The NZCVM webapp backend expects `EXTENT_LATLON_SPACING` in degrees, but the UI allows users to input spacing in kilometers (which is more intuitive). This test page validates the conversion process.

## What it tests

1. **Conversion accuracy**: Tests the `kmToDegrees()` function to ensure proper conversion from km to degrees at different latitudes
2. **Grid calculation**: Validates that the `calculateGridPoints()` function correctly calculates grid dimensions using the converted spacing
3. **API configuration**: Shows how the configuration data will be sent to the backend with proper degree-based spacing
4. **Comparison**: Shows the difference between the old method (treating km as degrees) vs the new correct method

## Usage

1. Open `test_conversion.html` in a browser
2. Adjust the input parameters (default values are for Wellington area)
3. Click "Test Conversion" to see the conversion results
4. Click "Test API Config Generation" to see the configuration that would be sent to the backend

## Key Changes Made

- `EXTENT_XY_SPACING` → `EXTENT_LATLON_SPACING` (consistent with backend expectations)
- Added conversion from km to degrees using latitude-dependent calculations
- Updated all function calls to include origin latitude for proper conversion
- Modified UI to indicate that km values are converted to degrees

## Files affected by the spacing conversion changes

- `js/apiClient.js` - Updated API calls to convert spacing and use correct parameter names
- `js/formHandler.js` - Updated grid calculation calls to include origin latitude
- `js/utils.js` - Updated `calculateGridPoints()` function to handle km-to-degree conversion
- `index.html` - Updated label to clarify that km input is converted to degrees

## Notes

- The conversion uses the larger of latitude or longitude degree spacing to be conservative
- At Wellington latitude (-41.5°), 1 km ≈ 0.003593° lat and ≈ 0.004798° lon
- The grid calculation now properly accounts for Earth's curvature at different latitudes
