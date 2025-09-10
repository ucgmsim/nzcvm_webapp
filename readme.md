## Introduction

The New Zealand Community Velocity Model (NZCVM) web app makes it easy to
generate models that describe the velocity of seismic wave propagation 
throughout New Zealand.

This repo contains all the files needed to set up this web app. Set up instructions
are below.

## Setting up the web app on `Mantle`

### Creating a user account

`Mantle` is a local server that runs most of our web applications. We will create a 
user account on `Mantle` called `nzcvm_webapp` that will run the `nzcvm_webapp` service:

 * `sudo useradd -m -s /bin/bash nzcvm_webapp` 
 where `-m` creates a home directory, and `-s /bin/bash` sets bash as the default shell
 * `sudo passwd nzcvm_webapp` to set a password

We will use `rootless docker` for this set up. If you need to install `rootless docker` 
on your system, follow [this guide](https://docs.docker.com/engine/security/rootless/). 
Otherwise, continue with the next step.

Access the `nzcvm_webapp` user's shell with
  * `sudo machinectl shell nzcvm_webapp@`

Now as the `nzcvm_webapp` user, run
  * `dockerd-rootless-setuptool.sh install`

Add `export DOCKER_HOST=unix:///run/user/$(id -u)/docker.sock` to the `nzcvm_webapp` 
user's `~/.bashrc` file to point to the Docker socket:
  * `echo 'export DOCKER_HOST=unix:///run/user/$(id -u)/docker.sock' >> ~/.bashrc`
* `source ~/.bashrc` (to reload the shell)

And finally, start `docker` (`--now`) and set it to automatically start
when the `nzcvm_webapp` user logs in (`enable`)
  * `systemctl --user enable --now docker`

Now we will log in to `Docker Hub` so we can `pull` the Docker container image 
containing this web application. 

### Logging in to Docker Hub
To start the log in process

`docker login`

The terminal will show a message like the following:

    USING WEB BASED LOGIN
    To sign in with credentials on the command line, use 'docker login -u <username>'

    Your one-time device confirmation code is: XXXX-XXXX
    Press ENTER to open your browser or submit your device code here: https://login.docker.com/activate

    Waiting for authentication in the browser…

If a web browser does not open automatically, copy the URL provided in the message and paste it into a 
web browser. On the web page that opens, enter the one-time device confirmation code provided in 
the message, and our organization's Docker Hub username and password to log in. After logging in to `Docker Hub` as the `nzcvm_webapp` user, exit and return to your usual account by running
  * `exit`

### Web application set up

* Create directories for the repo and NZCVM's required data resources
    * `sudo mkdir /mnt/mantle_data/nzcvm_webapp/src/nzcvm_webapp`
    * `sudo mkdir /mnt/mantle_data/nzcvm_webapp/src/nzcvm_data/`

* Give the `nzcvm_webapp` user all permissions for these directories
    * `sudo chown -R nzcvm_webapp:nzcvm_webapp /mnt/mantle_data/nzcvm_webapp`
    * `sudo chmod -R u+rwx /mnt/mantle_data/nzcvm_webapp`

* Copy the data resources required for the NZCVM code to `/mnt/mantle_data/nzcvm_webapp/src/nzcvm_data/`
    * e.g., use rsync or sftp

Get the `nzcvm_webapp` user's User ID (UID)
  * `id -u nzcvm_webapp`

Ensure that this UID is in the place of 1010 in the following line of 
[nzcvm_webapp.service](docker/nzcvm_webapp.service):
  * `Environment="DOCKER_HOST=unix:///run/user/1010/docker.sock"`

Now have `systemd` load the new unit file
  * `sudo systemctl daemon-reload`

And set the service to automatically start at start up
  * `sudo systemctl enable nzcvm_webapp.service`

The `nzcvm_webapp` user's Docker socket will normally only be available for running the 
container if the `nzcvm_webapp` user is logged in. However, we can keep `nzcvm_webapp`'s docker
socket active even if the `nzcvm_webapp` user is not logged in by enabling `linger` 
for the `nzcvm_webapp` user
  * `sudo loginctl enable-linger nzcvm_webapp`

Finally, to start the service, and make the web app publicly available
  * `cd /etc/systemd/system`
  * `sudo systemctl start nzcvm_webapp.service`

## Modifying the `nzcvm_webapp` web app

If the `nzcvm_webapp` web app has been modified, new container images need to be built
and pushed to Docker Hub. This can be done with any machine that has Docker. 
The frontend and backend components of this web app are in separate containers that are
built according to the Dockerfiles in the frontend and backend folders. The containers
are configured to work together by the [docker-compose.yml](docker-compose.yml) file 
in the top level of the repo.

To build the Docker container images, open a terminal and navigate to the top level of
the `nzcvm_webapp` repo
  * `cd /location/of/repo/`
  * `docker compose build`

To push the newly built container images to Docker Hub, ensure you are logged in to
our Docker Hub account (earthquakesuc), and then run
  * `docker compose push`

## File summaries

The functions of the following files are summarised below. See the comments in the files for more information.

- [nzcvm_webapp.service](nzcvm_webapp.service): The systemd service file 
- [docker-compose.yml](docker-compose.yml): Tells Docker how to run the containers. All `docker compose ...` commands require this file.
- [nzcvm_webapp_backend/Dockerfile](nzcvm_webapp_backend/Dockerfile): Tells Docker how to build the backend's image
- [nzcvm_webapp_backend/requirements.txt](nzcvm_webapp_backend/requirements.txt): Required packages for the Python backend app
- [nzcvm_webapp_frontend/Dockerfile](nzcvm_webapp_frontend/Dockerfile): Tells Docker how to build the frontend's image
- [nzcvm_webapp_frontend/nginx.conf](nzcvm_webapp_frontend/nginx.conf): Configuration for the frontend's Nginx server.
- [2p_nginx.config.conf](2p_nginx.config.conf): The location blocks for 2p's Nginx config file to set up the proxy pass to Mantle