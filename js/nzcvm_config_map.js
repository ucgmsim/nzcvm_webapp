// filepath: /home/arr65/src/nzcvm_webapp/js/nzcvm_config_map.js
// This file is now largely empty as its contents have been moved to modular files:
// - mapSetup.js
// - rectangleControls.js
// - formHandler.js
// - geojsonHandler.js
// - locationUpload.js
// - apiClient.js
// - utils.js

// You can potentially remove this file entirely if no global setup or coordination is needed here.
// Or, use it for initialization logic that depends on multiple modules being loaded.

console.log("Main script nzcvm_config_map.js loaded (now mostly empty).");

// Example: Initialization that might depend on multiple modules
document.addEventListener('DOMContentLoaded', () => {
    console.log("All modules should be loaded now.");
    // Any final setup that requires elements from different modules can go here.
    // For instance, ensuring the rectangle is brought to front after GeoJSON loads initially.
    if (rectangle && currentGeoJSONLayer) {
        rectangle.bringToFront();
    }
});
