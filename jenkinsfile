pipeline {
    agent any

    options {
        skipDefaultCheckout(true)
    }

    environment {
        DEPLOY_HOST = '1.14.127.163'
        DEPLOY_PATH = '/tmp/test_jenkins'
    }

    stages {
        stage('1. 接收代码提交') {
            steps {
                echo "收到代码提交：${env.GIT_COMMIT ?: 'SCM Trigger'}"
            }
        }

        stage('2. 拉取代码') {
            steps {
                deleteDir()
                checkout scm
            }
        }

        stage('3. 部署到服务器') {
            steps {
                sshagent(credentials: ['deploy-server-key']) {
                    sh '''
                        rsync -az --delete \
                          --exclude=".git" \
                          --exclude="Jenkinsfile" \
                          ./ deploy@${DEPLOY_HOST}:${DEPLOY_PATH}/


                    '''
                }
            }
        }
    }
}