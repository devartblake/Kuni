const {ipcMain, BrowserWindow, dialog} = require('electron');
const mixerInteractive = require('./mixer-interactive');
const cooldown = require('./cooldowns.js');
const JsonDB = require('node-json-db');

// Handlers
const controlHandler = require('./handlers/controlProcessor.js');
const effectRunner = require('./effect-runner.js');

/** Control Router **/
// This function takes in every button press and routes the info to the right destination.
function controlRouter(mouseevent, mixerControls, mixerControl, gameJson, inputEvent, participant){
    var controlID = inputEvent.input.controlID;
    var bot = gameJson.bot;
    var control = bot.controls[controlID];
    var effects = control.effects;
    var username = "";
    if(participant) {
      username = participant.username;
    }

    // Create request wrapper (instead of having to pass in a ton of args)
    var processEffectsRequest = {
        effects: effects,
        bot: bot,
        participant: participant,
        control: control,
        isManual: false
    } 

    // Check to see if this is a mouse down or mouse up event.
    if(mouseevent == "mousedown"){
        // Mouse Down event called.

        // Make sure cooldown is processed.
        cooldown.router(mixerControls, mixerControl, bot, control)
        .then((res) =>{
            // Process effects.
            autoPlay(processEffectsRequest)

            // Charge sparks for the button that was pressed.
            if (inputEvent.transactionID) {
                // This will charge the user.
                mixerInteractive.sparkTransaction(inputEvent.transactionID);
            };

            // Throw this button info into UI log.
            renderWindow.webContents.send('eventlog', {username: participant.username, event: "pressed the " + controlID + " button."});
        })

    } else {
        // Mouse up event called. 
        // Right now this is only used by game controls to know when to lift keys up.

        // Loop through effects for this button.
        for (var item in effects){
            var effect = effects[item];
            var effectType = effect.type;

            // See if the effect is game control.
            if(effectType == "Game Control"){
                controlHandler.press('mouseup', effect, control);
            }
        }
    }
}

/** Auto Play **/
// This function will activate a button when triggered through mixer..
function autoPlay(processEffectsRequest){
    // Run the effects
    effectRunner.processEffects(processEffectsRequest)
    .then(function() {
        // This is called after the effects are done running. 
    });
}

/** Manual Play **/
// This function will active a button when it is manually triggered via the ui.
function manualPlay(controlID){

    // Get current controls board and set vars.
    try{
        // Get last board name.
        var dbSettings = new JsonDB("./user-settings/settings", true, true);
        var gameName = dbSettings.getData('/interactive/lastBoard');

        // Get settings for last board.
        var dbControls = new JsonDB("./user-settings/controls/" + gameName, true, true);

        var control = dbControls.getData('./firebot/controls/' + controlID);
    } catch(err){
        renderWindow.webContents.send('error', "There was an error trying to manually activate this button.");
        console.log(err);
        return;
    };

    var effects = control.effects;
    
    // Create request wrapper (instead of having to pass in a ton of args)
    // Make sure we specify isManual as true
    var processEffectsRequest = {
      effects: effects,
      firebot: null,
      participant: null,
      control: control,
      isManual: true
    }
    
    // Run the effects
    effectRunner.processEffects(processEffectsRequest)
      .then(function() {
        // This is called after the effects are done running. 
      });

    // Throw this information into the moderation panel.
    renderWindow.webContents.send('eventlog', {username: 'You', event: "Manually pressed the " + controlID+" button."});
}

/** Manually play a button. **/
// This listens for an event from the render and will activate a button manually.
ipcMain.on('manualButton', function(event, controlID) {
    manualPlay(controlID);
});

// Export Functions
exports.router = controlRouter;