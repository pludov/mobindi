FROM ubuntu:24.04



RUN apt-get update && apt-get install -y \
    build-essential \
    curl \
    git \
    wget \
    vim \
    cmake \
    joe


# Install node.js and npm
RUN curl -fsSL https://deb.nodesource.com/setup_22.x | bash - && apt-get install -y nodejs


# Indilib dependencies
RUN apt-get install -y libev-dev libcfitsio-dev libnova-dev libcurl4-openssl-dev libgsl-dev libfftw3-dev zlib1g-dev libusb-1.0-0-dev libjpeg-turbo8-dev

# Mobindi deps
RUN apt-get install -y libpng-dev libjpeg-dev libcgicc-dev pkg-config udev

# Indilib installation
RUN mkdir /deps

ARG INDI_VERSION=v2.2.2

RUN git clone -b ${INDI_VERSION} https://github.com/indilib/indi  /deps/indi

RUN mkdir /build

RUN mkdir /build/indi
RUN cd /build/indi && cmake -DCMAKE_INSTALL_PREFIX:PATH=/usr /deps/indi
RUN cd /build/indi && make -j$(nproc) && make install
