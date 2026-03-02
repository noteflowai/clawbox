#!/bin/bash

# todo: need $REGISTRY and $REPOSITORY_NAMESPACE
# export REGISTRY=867344450900.dkr.ecr.us-west-2.amazonaws.com
# export REPOSITORY_NAMESPACE=public

# Compile the Dockerfile of all subdirectories of the current directory
function build_images() {
  for dir in */; do
    cd $dir
    local name=${dir%/}
    local repository="$REPOSITORY_NAMESPACE/dev"
    local new_image="$REGISTRY/${repository}:${name}"
    echo $repository
    echo $new_image
    # docker buildx create --driver docker-container --use --name multi-platform-builder
    aws ecr describe-repositories --repository-names $repository --region $AWS_REGION >/dev/null 2>&1 || (echo "Creating ECR repository: $repository" && aws ecr create-repository --repository-name $repository --region $AWS_REGION) && echo "ECR repository already exists: $repository"
    docker buildx build --platform linux/arm64 -t $new_image --push .
    cd ..
  done
}

BUILDX_EXPERIMENTAL=1
#docker buildx create --use

build_images
