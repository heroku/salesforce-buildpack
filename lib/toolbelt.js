const util = require('util');
const toolbelt = require('salesforce-alm-buildpack-dev');

const getCommand = (topic) => {
    if (util.isString(topic)) {
        return toolbelt.commands.find((commandObj) => commandObj.command === topic);
    }
    return null;
}

module.exports = {
    run(topic, flags) {
        const cmd = getCommand(topic);
        return cmd.run({ flags });//.then(ctx => cmd.execute(ctx));
    }
};
