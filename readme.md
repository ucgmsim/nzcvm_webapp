## Introduction

This repo contains the source code for the `nzcvm_config` website, and files to create a Docker
image of the server. The `nzcvm_config` website makes it easy to generate the configuration file 
needed to run the NZCVM code.

## Setting up a host server in a Docker container

### Build and push the image of the Docker container

These steps can be carried out on any machine that has Docker (i.e., they do not need to be carried out on the machine that will host the website).  

* Clone this repo
    * `git clone https://github.com/ucgmsim/nzcvm_config.git /nzcvm_config`

* In a terminal, navigate to the `docker` folder in the cloned repo (the location will depend on where the repo was cloned)
    * e.g., `cd /home/username/nzcvm_config/docker`

* Build the Docker image, which includes the `nzcvm_config` source files due to a `git clone` command in `Dockerfile`. In the following command, `earthquakesuc` is our Docker Hub username.

    * `docker build -t earthquakesuc/nzcvm_config .` (if any cached `nzcvm_config` source files can be kept)

    * `docker build --no-cache -t earthquakesuc/nzcvm_config .` (if any cached `nzcvm_config` source files should be overwritten, for example if `nzcvm_config` has been updated)

* Push the image to Docker Hub (see the section below on logging in to Docker Hub)
    * `docker push earthquakesuc/nzcvm_config`

### Create a dedicated user account on the host machine to run the service

This guide uses **Rootless Docker**, meaning that the Docker installation is for a specific user that does not require `sudo`. If you need to install Rootless Docker on your system, follow [this guide](https://docs.docker.com/engine/security/rootless/).

* Create a user called `nzcvm_config` to run the systemd service
    *  `sudo useradd -m -s /bin/bash username` where `-m` creates a home directory and `-s /bin/bash` sets the default shell to bash.

* Temporarily give the `nzcvm_config` user `sudo` privileges to make the next few steps simpler (`sudo` privileges will be revoked later)
    *  `sudo usermod -aG sudo nzcvm_config`

* Change to the `nzcvm_config` user
    * e.g., `exit`
    * e.g., `ssh nzcvm_config@mantle` (if hosting on Mantle)

* Set the `nzcvm_config` user's Docker to start at startup and also start it now 
    * `sudo systemctl enable --now docker` where `enable` sets Docker to start at startup and `--now` also starts it now.

* Allow the `nzcvm_config` user to linger so it will be available at startup 
    * `sudo loginctl enable-linger $(whoami)`
* Add the following line to the `nzcvm_config` user's `~/.bashrc` file to point to the user's Docker socket
    * `export DOCKER_HOST=unix:///run/user/$(id -u)/docker.sock`

* Change back to your main account with `sudo` privileges
    * e.g., `exit`
    * e.g., `ssh main_username@mantle`

* Revoke the `nzcvm_config` user's `sudo` privileges as they are no longer needed 
    * `sudo deluser nzcvm_config sudo`

### Start the service that runs the website

* Copy the `nzcvm_config.service` file to the host machine
    * e.g., `cp nzcvm_config.service /etc/systemd/system/`
* Reload the systemd unit files
    *  `sudo systemctl daemon-reload`
* Set the service to start on startup with `enable`
    * `sudo systemctl enable nzcvm_config.service`

* Start the service to pull and run the latest image of the container from Docker Hub
    * `sudo systemctl start nzcvm_config.service` (if **not** already running)
    * `sudo systemctl restart nzcvm_config.service` (if already running)

* Check the status of the service to ensure it's running
    * `sudo systemctl status nzcvm_config.service` 

* Check the status of the `nzcvm_config` container (as the `nzcvm_config` user)
    * `docker ps`

### Logging in to Docker Hub
Open a terminal and enter the following command:
`docker login`

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
