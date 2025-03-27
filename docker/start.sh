#!/usr/bin/env sh 
# The above line specifies the script interpreter by using the environment's `sh`. This is the shebang line that tells the system to execute the script with the shell interpreter.

echo "Starting nginx"

# Make sure our custom nginx configuration is properly linked
if [ -f /etc/nginx/conf.d/default.conf ]; then
  echo "Removing default nginx configuration"
  rm /etc/nginx/conf.d/default.conf
fi

# Verify the repository exists and has content
echo "Checking repository content:"
ls -la /nzcvm_config

# Print the nginx configuration for debugging
echo "Current nginx configuration:"
cat /etc/nginx/nginx.conf

# Launches Nginx with the directive to run in the foreground (`daemon off;`). Running Nginx in the foreground is particularly useful in container environments to prevent the container from exiting.
nginx -g "daemon off;"
