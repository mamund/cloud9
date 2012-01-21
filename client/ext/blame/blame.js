/**
 * Extension Template for the Cloud9 IDE client
 * 
 * Inserts a context menu item under the "Edit" menu, which, upon being
 * clicked displays a simple window with a "Close" button
 * 
 * This file is stripped of comments from extension_template.js in order to
 * provide a quick template for future extensions. Please reference
 * extension_template.js to see comprehensive documentation of extension
 * functionality
 * 
 * @copyright 2011, Ajax.org B.V.
 * @license GPLv3 <http://www.gnu.org/licenses/gpl.txt>
 
 for any file open in the editor, blame it
 - stateful (info for each file)
 - allow user to close (user interface considerations)
 - know when the user edits the file they are blaming (update the blame)
 - parse the porcelian output
 - dispatch to the server which file is currently selected
 - want to know when the editor is scrolled (update the position)
 
 */
 
define(function(require, exports, module) {

var ext = require("core/ext");
var ide = require("core/ide");
var markup = require('text!ext/blame/blame.xml');
var blameparser = require('ext/blame/blame_parser');
var editors = require("ext/editors/editors");
var util = require("core/util");

module.exports = ext.register("ext/blame/blame", {
    name     : "Blame",
    dev      : "Mike Amundsen",
    alone    : true,
    type     : ext.GENERAL,
    markup   : markup,
    blameState : {},
    blameParser : new blameparser(),

    nodes : [],

    init : function(amlNode){
        hboxMain.insertBefore(new apf.vbox({
            id:'vboxBlame',
            width:0,
            anchors:'0 0 0 0',
            childNodes:[
                new apf.bar({
                    height:30,
                    'class' : 'blame_bar',
                    childNodes: [
                        new apf.button({
                            icon     : "arrow_left.png",
                            skin     : "c9-toolbarbutton",
                            width    : 29,
                            tooltip  : "Close Blame",
                            onclick  : function(){require('ext/blame/blame').closeBlame();}
                        })
                    ]
                }),
                new apf.text({
                    anchors:'30 0 0 0',
                    flex:1,id:'blameText', 
                    'class':'blame_text', 
                    overflow:'hidden'
                }),
                new apf.scrollbar({
                    "for" : "blameText",
                    id : "scrollBlameText",
                    width : "0",
                    padding : "0 0 0 0",
                    margin : "0 0 0 0",
                    overflow : "auto",
                    style : "visibility: hidden"
                })

            ]
        }), colMiddle);
    },

    hook : function(){
        ext.initExtension(this);
        var _self = this;
        
        this.nodes.push(
            ide.mnuEdit.appendChild(new apf.divider()),
            ide.mnuEdit.appendChild(new apf.item({caption:'Blame File', onclick:function(){
                _self.checkBlameState();
            }}))
        );
        
        ide.addEventListener('socketMessage',this.onMessage.bind(this));

        blameText.addEventListener("scroll", this.$onBlameScroll = function(e) {
            _self.onBlameScroll(e);
        });

        this.aceScrollbar = editors.currentEditor.ceEditor.$editor.renderer.scrollBar;        
        this.aceScrollbar.addEventListener("scroll", this.$onAceScroll = function(e) {
            _self.aceScroll(e.data);
        });

        tabEditors.addEventListener('afterswitch',function(e){
            console.log(e);
            
            // todo : make sure e.previous is stable 
            var filePath = e.previous;
            if(filePath.indexOf('/workspace/')===0) {
                filePath = filePath.substr(11);
            }
            if(!_self.blameState[filePath]) {
                _self.closeBlame();
                return;
            }
            
            if(_self.blameState[filePath].state==='open') {
                _self.checkBlameState(filePath);                
            }
            else {
                _self.closeBlame();
            }
        });
        
        _self.closeBlame();
    },

    closeBlame : function() {
        var file =  tabEditors.getPage().$model.data.getAttribute("path");
        file = this.fixFile(file);
        
        if(this.blameState[file]) {
            this.blameState[file].state = 'closed';
        }
        
        blameText.hide();
        vboxBlame.setWidth(0);
        vboxBlame.hide();
        apf.layout.forceResize(document.body);
    },

    showBlame : function() {
        vboxBlame.setWidth(250);
        vboxBlame.show();
        blameText.show();
        apf.layout.forceResize(document.body);
    },
    
    checkBlameState : function(file) {
        if(!file) {
            var file = tabEditors.getPage().$model.data.getAttribute("path");
        }
        file = this.fixFile(file);
        
        if(this.blameState[file]) {
            this.blameState[file].state = 'open';
            blameText.setValue(this.blameState[file].output); 
        }
        else {
            this.blameCurrentFile();
        }
        this.showBlame();
    },
    
    blameCurrentFile : function(){
        var cmd = "gittools";

        var data = {
            command    : cmd,
            subcommand : "blame",
            file       : tabEditors.getPage().$model.data.getAttribute("path")
        };
        //data.file = this.fixFile(data.file);
        
        ide.dispatchEvent("track_action", {type: "blame", cmd: cmd});
        if (ext.execCommand(cmd, data) !== false) {
            if (ide.dispatchEvent("consolecommand." + cmd, {
              data: data
            }) !== false) {
                if (!ide.onLine) {
                    util.alert(
                        "Currently Offline",
                        "Currently Offline",
                        "This operation could not be completed because you are offline."
                    );
                }
                else {
                    ide.send(JSON.stringify(data));
                }
            }
        }
    },
    
    onMessage : function(message) {
        message = message.message;
        if(message.type!=='result' && message.subtype!=='gittools') {
            return false;
        }
        
        if(message.body.err) {
            return util.alert(
                "Git Blame Error",
                "Git Blame Error",
                "Error blaming the file:"+message.body.err
            );
        }
        
        console.log(message);
    
        this.handleBlameOutput(message.body.file, message.body.out);
    },

    aceScroll : function(pos) {
        var file = tabEditors.getPage().$model.data.getAttribute("path");
        file = this.fixFile(file);
        
        if (this.blameState[file] && this.blameState[file].state==='open') {
            var layerConfig = editors.currentEditor.ceEditor.$editor.renderer.layerConfig;
            var percentage = pos / (layerConfig.maxHeight - layerConfig.height);
            scrollBlameText.setPosition(percentage, true);
        }
    },

    onBlameScroll : function(e) {
        editors.currentEditor.ceEditor.$editor.renderer.scrollBar.setScrollTop(e.scrollPos);
    },
    
    handleBlameOutput: function(file, out) {
        var lineData,commitData,arrayOutput,format,hash,ds,bk,cls;
        
        this.blameParser.parseBlame(out);

        this.blameState[file] = {
            state : 'open',
            commitData : this.blameParser.getCommitData(),
            lineData : this.blameParser.getLineData()
        };
        console.log(this.blameState[file]);
        
        lineData = this.blameState[file].lineData;
        commitData = this.blameState[file].commitData;
        
        bk='';
        cls='on';
        arrayOutput = [];
        format = '<p class="{@cls}"><span class="author">{@author}</span><span class="date">{@date}</span></p>';
        for(var i in lineData) {
            hash = commitData[lineData[i].hash];
            ds = new Date(parseInt(hash.authorTime, 10) * 1000).toString().split(' ');
            if(bk!==hash.author+hash.authorTime) {
                cls=(cls==='on'?'off':'on');
                arrayOutput.push(format.replace('{@cls}',cls).replace('{@author}',hash.author).replace('{@date}',ds[0]+' '+ds[1]+' '+ds[2]+' '+ds[3]));
                bk=hash.author+hash.authorTime;
            }
            else {
                arrayOutput.push(format.replace('{@cls}',cls).replace('{@author}','*').replace('{@date}',''));
            }
        }
        
        this.blameState[file].output = arrayOutput.join('');  
        blameText.setValue(this.blameState[file].output); 
    },
    
    fixFile : function(file) {
        if(file.indexOf('/workspace/')===0) {
            file = file.substr(11);
        }
        return file;
    },
    
    enable : function(){
        this.nodes.each(function(item){
            item.enable();
        });
    },

    disable : function(){
        this.nodes.each(function(item){
            item.disable();
        });
    },

    destroy : function(){
        this.nodes.each(function(item){
            item.destroy(true, true);
        });
        this.nodes = [];
    }
});

});