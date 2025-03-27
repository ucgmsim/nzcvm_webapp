#!/usr/bin/env sh 
# The above line specifies the script interpreter by using the environment's `sh`. This is the shebang line that tells the system to execute the script with the shell interpreter.

echo "Starting nginx"

# Launches Nginx with the directive to run in the foreground (`daemon off;`). Running Nginx in the foreground is particularly useful in container environments to prevent the container from exiting.
nginx -g "daemon off;" 
