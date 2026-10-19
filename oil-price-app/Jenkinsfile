pipeline {
    agent any
    environment {
        REGISTRY = "localhost:5000"
        TAG = "v${BUILD_NUMBER}"
    }
    stages {
        stage('Build Backend') {
            steps {
                sh "docker build -t ${REGISTRY}/oilwatch-backend:${TAG} ${WORKSPACE}/backend"
            }
        }
        stage('Build Frontend') {
            steps {
                sh "docker build -t ${REGISTRY}/oilwatch-frontend:${TAG} ${WORKSPACE}/frontend"
            }
        }
        stage('Push to Registry') {
            steps {
                sh "docker push ${REGISTRY}/oilwatch-backend:${TAG}"
                sh "docker push ${REGISTRY}/oilwatch-frontend:${TAG}"
            }
        }
    }
}
