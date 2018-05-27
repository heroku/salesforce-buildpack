heroku pipelines:destroy pipelineTempApp
heroku apps:destroy -a devTempApp -c devTempApp
heroku apps:destroy -a stagingTempApp -c stagingTempApp
heroku apps:destroy -a prodTempApp -c prodTempApp
rm -- "destroyTempApp.sh"
