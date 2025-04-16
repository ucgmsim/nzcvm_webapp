### Introduction

This repository contains the source code for the `nzcvm_config` website, and files to create a Docker
image of the server. The `nzcvm_config` website makes it easy to generate the configuration file 
needed to run the NZCVM code.

### Setting up a host server in a Docker container

* If this is the first time running Docker as this user
    * Enable and start the docker service for your user
        * `sudo systemctl enable --now docker`
    * Allow your user to "linger" to run services at start up
        * `sudo loginctl enable-linger $(whoami)`
    * Add the following lines to your `~/.bashrc` file.
        * `export PATH=/usr/bin:$PATH`
        * `export DOCKER_HOST=unix:///run/user/$(id -u)/docker.sock`


* In a terminal, change to the `docker` folder in the repository
    * e.g., `cd /home/username/src/nzcvm_config/docker`
* Build the Docker image (which includes the `nzcvm_config` source files due to a `git clone` command in `Dockerfile`). 
    In the following command, `earthquakesuc` is our Docker Hub username.
    * If this is the first time building the image, or the `nzcvm_config` package has not changed, run the following command:
        * `docker build -t earthquakesuc/nzcvm_config .` (add `sudo` if running as root) 
    * If this is not the first time building the image, and the `nzcvm_config` package has changed, run with `--no-cache` 
      so the image will be built with the latest version of the `nzcvm_config` website source:
        * `docker build --no-cache -t earthquakesuc/nzcvm_config .` (add `sudo` if running as root) 

    * Push the image to Docker Hub (see the section below on logging in to Docker Hub)
        * `docker push earthquakesuc/nzcvm_config` (add `sudo` if running as root) 

    * Copy the `nzcvm_config.service` to the host machine
        * `cp nzcvm_config.service /etc/systemd/system/`
    * Reload the systemd unit files.
        *  `sudo systemctl daemon-reload`

    * Pull the latest Docker image from Docker Hub and run the `nzcvm_config` container by starting the service (`nzcvm_config.service`).
        * If the service is not currently running, start it.
            * `sudo systemctl start nzcvm_config.service`
        * If the service is already running, restart it.
            * `sudo systemctl restart nzcvm_config.service`

    * Check the status of the service to ensure it is running
        * `sudo systemctl status nzcvm_config.service` 

    * Check the status of the `nzcvm_config` container to ensure it is running
        * `docker ps` (add `sudo` if running as root)

### Logging in to Docker Hub
Open a terminal and enter the following command:
`sudo docker login`

The terminal will show a message like the following:

    USING WEB BASED LOGIN
    To sign in with credentials on the command line, use 'docker login -u <username>'

    Your one-time device confirmation code is: XXXX-XXXX
    Press ENTER to open your browser or submit your device code here: https://login.docker.com/activate

    Waiting for authentication in the browser…

If a web browser does not open automatically, copy the URL provided in the message and 
paste it into a web browser. On the web page that opens, enter the one-time device 
confirmation code provided in the message, and our organization's Docker Hub username 
and password to log in.

## Files for building a Docker image

The following files in the `docker` directory set up the nzcvm_config service in a 
container, and run it on startup with systemd. 

- [Service file](docker/nzcvm_config.service)
- [Dockerfile defining the nzcvm_config container](docker/Dockerfile)
- [nginx config exposing the server outside the container](docker/nginx.conf)
- [Entrypoint script that runs when container is executed](docker/start.sh)
