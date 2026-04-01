pipeline {
    agent any
    environment {
        DOCKERHUB_USER = 'wael558'
        IMAGE_NAME     = "${DOCKERHUB_USER}/waelto5clean-frontend"
        IMAGE_TAG      = "${BUILD_NUMBER}"
        SONAR_HOST     = 'http://172.17.0.1:9000'
    }
    stages {
        stage('Checkout') {
            steps {
                git branch: 'main',
                    url: 'https://github.com/wael-khadraoui/WaelTo5Clean-frontend.git',
                    credentialsId: 'github-creds'
            }
        }
        stage('Install Dependencies') {
            steps {
                sh 'npm install'
            }
        }
        stage('SAST - SonarQube') {
            steps {
                withCredentials([string(credentialsId: 'sonarqube-token', variable: 'SONAR_TOKEN')]) {
                    sh """
                        sonar-scanner \
                          -Dsonar.projectKey=WaelTo5Clean-frontend \
                          -Dsonar.projectName=WaelTo5Clean-frontend \
                          -Dsonar.sources=src \
                          -Dsonar.host.url=${SONAR_HOST} \
                          -Dsonar.token=${SONAR_TOKEN}
                    """
                }
            }
        }
        stage('OWASP Dependency Check') {
            steps {
                sh 'npm audit --audit-level=high || true'
            }
        }
        stage('Build Docker Image') {
            steps {
                sh "docker build -t ${IMAGE_NAME}:${IMAGE_TAG} ."
            }
        }
        stage('Trivy Image Scan') {
            steps {
                sh "trivy image --severity HIGH,CRITICAL --exit-code 0 ${IMAGE_NAME}:${IMAGE_TAG}"
            }
        }
        stage('Snyk Security Scan') {
            steps {
                sh "snyk test --docker ${IMAGE_NAME}:${IMAGE_TAG} --severity-threshold=high || true"
            }
        }
        stage('Push to DockerHub') {
            steps {
                withCredentials([usernamePassword(
                    credentialsId: 'dockerhub-creds',
                    usernameVariable: 'DOCKER_USER',
                    passwordVariable: 'DOCKER_PASS'
                )]) {
                    sh '''
                        echo "$DOCKER_PASS" | docker login -u "$DOCKER_USER" --password-stdin
                        docker push ${IMAGE_NAME}:${IMAGE_TAG}
                        docker tag ${IMAGE_NAME}:${IMAGE_TAG} ${IMAGE_NAME}:latest
                        docker push ${IMAGE_NAME}:latest
                        docker logout
                    '''
                }
            }
        }
        stage('Cleanup') {
            steps {
                sh "docker rmi ${IMAGE_NAME}:${IMAGE_TAG} || true"
            }
        }
    }
    post {
        success { echo 'Pipeline Frontend DevSecOps termine avec succes !' }
        failure { echo 'Pipeline Frontend echoue - verifier les logs' }
        always { cleanWs() }
    }
}
