/**
 * Searchinfiles Module for the Cloud9 IDE
 *
 * @copyright 2010, Ajax.org B.V.
 * @license GPLv3 <http://www.gnu.org/licenses/gpl.txt>
 */
define(function(require, exports, module) {
    main.consumes = [
        "plugin", "c9", "util", "settings", "ui", "layout", "findreplace", 
        "find", "anims", "menus", "tabs", "fs", "commands", "tooltip", 
        "tree", "apf", "console", "preferences"
    ];
    main.provides = ["findinfiles"];
    return main;

    function main(options, imports, register) {
        var c9          = imports.c9;
        var util        = imports.util;
        var Plugin      = imports.plugin;
        var settings    = imports.settings;
        var ui          = imports.ui;
        var fs          = imports.fs;
        var anims       = imports.anims;
        var menus       = imports.menus;
        var commands    = imports.commands;
        var console     = imports.console;
        var layout      = imports.layout;
        var tooltip     = imports.tooltip;
        var tabs        = imports.tabs;
        var tree        = imports.tree;
        var findreplace = imports.findreplace;
        var prefs       = imports.preferences;
        var find        = imports.find;
        
        var skin      = require("text!./skin.xml");
        var markup    = require("text!./findinfiles.xml");
        var lib       = require("plugins/c9.ide.find.replace/libsearch");
        
        /***** Initialization *****/
        
        var plugin = new Plugin("Ajax.org", main.consumes);
        var emit   = plugin.getEmitter();
        
        var libsearch = lib(settings, execFind, toggleDialog, function(){});
        
        // Make ref available for other search implementations (specifically searchreplace)
        lib.findinfiles = plugin;
        
        var position, returnFocus, lastActiveAce;
        var replaceAll = false;
    
        // ui elements
        var trFiles, txtSFFind, txtSFPatterns, chkSFMatchCase;
        var chkSFRegEx, txtSFReplace, chkSFWholeWords, searchRow, chkSFConsole;
        var winSearchInFiles, ddSFSelection, tooltipSearchInFiles, btnSFFind;
        var btnSFReplaceAll, btnCollapse;
        
        var loaded = false;
        function load(){
            if (loaded) return false;
            loaded = true;
    
            commands.addCommand({
                name    : "searchinfiles",
                hint    : "search for a string through all files in the current workspace",
                bindKey : {mac: "Shift-Command-F", win: "Ctrl-Shift-F"},
                exec    : function () {
                    toggleDialog();
                }
            }, plugin);
    
            menus.addItemByPath("Find/~", new apf.divider(), 10000, plugin),
            menus.addItemByPath("Find/Find in Files...", new apf.item({
                command : "searchinfiles"
            }), 20000, plugin);
            
            settings.on("read", function(e){
                settings.setDefaults("state/findinfiles", [
                    ["regex", "false"],
                    ["matchcase", "false"],
                    ["wholeword", "false"],
                    ["console", "true"],
                    ["consolelaunch", "false"],
                    ["fullpath", "false"],
                    ["scrolldown", "false"],
                    ["clear", "true"]
                ]);
            }, plugin);
            
            prefs.add({
               "General" : {
                   position : 100,
                   "Find in Files" : {
                       position : 30,
                        "Show Full Path in Results" : {
                            type     : "checkbox",
                            position : 100,
                            path     : "user/findinfiles/@fullpath"
                        },
                        "Clear Results Before Each Search" : {
                            type     : "checkbox",
                            position : 100,
                            path     : "user/findinfiles/@clear"
                        },
                        "Scroll Down as Search Results Come In" : {
                            type     : "checkbox",
                            position : 100,
                            path     : "user/findinfiles/@scrolldown"
                        },
                        "Open Files when Navigating Results with ↓ ↑" : {
                            type     : "checkbox",
                            position : 100,
                            path     : "user/findinfiles/@consolelaunch"
                        }
                   }
               }
            }, plugin);
            
            tabs.on("focus", function(e){
                if (e.page.editor.type == "ace" 
                  && searchPanel[true] != e.page 
                  && searchPanel[false] != e.page) {
                    lastActiveAce = e.page;
                }
            }, plugin);
            
            var page = tabs.focussedPage;
            lastActiveAce = page && page.editor.type == "ace" ? page : null;
            
            // Context Menu
            tree.getElement("mnuCtxTree", function(mnuCtxTree) {
                menus.addItemToMenu(mnuCtxTree, new apf.item({
                    match   : "[file|folder]",
                    command : "searchinfiles",
                    caption : "Search in files"
                }), 410, plugin);
            });
        }
        
        var drawn = false;
        function draw(){
            if (drawn) return;
            drawn = true;
            
            // Import Skin
            ui.insertSkin({
                name         : "searchinfiles",
                data         : skin,
                "media-path" : options.staticPrefix + "/images/"
            }, plugin);
            
            // Create UI elements
            searchRow = layout.findParent(plugin);
            ui.insertMarkup(null, markup, plugin);
            
            txtSFFind        = plugin.getElement("txtSFFind");
            txtSFPatterns    = plugin.getElement("txtSFPatterns");
            chkSFMatchCase   = plugin.getElement("chkSFMatchCase");
            chkSFRegEx       = plugin.getElement("chkSFRegEx");
            txtSFReplace     = plugin.getElement("txtSFReplace");
            chkSFWholeWords  = plugin.getElement("chkSFWholeWords");
            chkSFConsole     = plugin.getElement("chkSFConsole");
            ddSFSelection    = plugin.getElement("ddSFSelection");
            btnSFFind        = plugin.getElement("btnSFFind");
            winSearchInFiles = plugin.getElement("winSearchInFiles");
            btnSFReplaceAll  = plugin.getElement("btnSFReplaceAll");
            btnCollapse      = plugin.getElement("btnCollapse");
            tooltipSearchInFiles = plugin.getElement("tooltipSearchInFiles");
    
            btnSFFind.on("click", function(){ execFind(); });
            btnSFReplaceAll.on("click", function(){ execReplace(); });
            btnCollapse.on("click", function(){ toggleDialog(-1); });
    
            var control;
            txtSFReplace.on("focus", function(){
                if (control) control.stop();
                control = {};
                
                // I'd rather use css anims, but they didn't seem to work
                apf.tween.single(txtSFReplace.$ext.parentNode, {
                    type     : "boxFlex",
                    from     : txtSFReplace.$ext.parentNode.style[apf.CSSPREFIX + "BoxFlex"] || 1,
                    to       : 3,
                    anim     : apf.tween.easeOutCubic,
                    control  : control,
                    steps    : 15,
                    interval : 1
                });
            });
            txtSFReplace.on("blur", function(){
                if (txtSFReplace.getValue())
                    return;
                
                if (control) control.stop();
                control = {};
                
                // I'd rather use css anims, but they didn't seem to work
                apf.tween.single(txtSFReplace.$ext.parentNode, {
                    type     : "boxFlex",
                    from     : txtSFReplace.$ext.parentNode.style[apf.CSSPREFIX + "BoxFlex"] || 3,
                    to       : 1,
                    anim     : apf.tween.easeOutCubic,
                    control  : control,
                    steps    : 15,
                    interval : 1
                });
            });
    
            commands.addCommand({
                name        : "hidesearchinfiles",
                bindKey     : {mac: "ESC", win: "ESC"},
                isAvailable : function(editor){
                    return winSearchInFiles.visible;
                },
                exec : function(env, args, request) {
                    toggleDialog(-1);
                }
            }, plugin);
    
            winSearchInFiles.on("propVisible", function(e) {
                if (e.value) {
                    if (trFiles)
                        trFiles.on("afterselect", setSearchSelection);
                    setSearchSelection();
                }
                else {
                    if (trFiles)
                        trFiles.removeEventListener("afterselect",
                            setSearchSelection);
                }
            });
            
            tree.getElement("trFiles", function(element){
                trFiles = element;
                trFiles.on("afterselect", setSearchSelection);
            });
    
            txtSFFind.ace.session.on("change", function() {
                if (chkSFRegEx.checked)
                    libsearch.checkRegExp(txtSFFind, tooltipSearchInFiles, winSearchInFiles);
            });
            libsearch.addSearchKeyboardHandler(txtSFFind, "searchfiles");
    
            var kb = libsearch.addSearchKeyboardHandler(txtSFReplace, "replacefiles");
            kb.bindKeys({
                "Return|Shift-Return": function(){ execReplace(); }
            });
    
            kb = libsearch.addSearchKeyboardHandler(txtSFPatterns, "searchwhere");
            kb.bindKeys({
                "Return|Shift-Return": function(){ execFind(); }
            });
    
            var tt = document.body.appendChild(tooltipSearchInFiles.$ext);
    
            chkSFRegEx.on("propValue", function(e){
                libsearch.setRegexpMode(txtSFFind, apf.isTrue(e.value));
            });
    
            var cbs = winSearchInFiles.selectNodes("//a:checkbox");
            cbs.forEach(function(cb){
                tooltip.add(cb.$ext, {
                    message : cb.label,
                    width   : "auto",
                    timeout : 0,
                    tooltip : tt,
                    animate : false,
                    getPosition : function(){
                        var pos = apf.getAbsolutePosition(winSearchInFiles.$ext);
                        var left = pos[0] + cb.getLeft();
                        var top = pos[1];
                        return [left, top - 16];
                    }
                });
            });
    
            tooltip.add(txtSFPatterns.$ext, {
                message : txtSFPatterns.label,
                width   : "auto",
                timeout : 0,
                tooltip : tt,
                animate : false,
                getPosition : function(){
                    var pos = apf.getAbsolutePosition(winSearchInFiles.$ext);
                    var left = pos[0] + txtSFPatterns.getLeft();
                    var top = pos[1];
                    return [left, top - 16];
                }
            });
            
            // Offline
            c9.on("stateChange", function(e){
                // Online
                if (e.state & c9.STORAGE) {
                    winSearchInFiles.enable();
                }
                // Offline
                else {
                    winSearchInFiles.disable();
                    btnCollapse.enable();
                }
            }, plugin);
            
            emit("draw");
        }
        
        /***** Methods *****/
        
        function setSearchSelection(e){
            var selectedNode, name;
    
            if (trFiles) {
                // If originating from an event
                if (e && e.selected)
                    selectedNode = e.selected;
                else
                    selectedNode = getSelectedTreeNode();
    
                var filepath = selectedNode.getAttribute("path").split("/");
    
                name = "";
                // get selected node in tree and set it as selection
                if (selectedNode.localName == "folder")
                    name = filepath[filepath.length - 1];
                else if (selectedNode.localName == "file")
                    name = filepath[filepath.length - 2];
    
                if (name.length > 25)
                    name = name.substr(0, 22) + "...";
            }
            else {
                var path = settings.get("user/tree_selection/@path");
                if (!path)
                    return;
    
                var p;
                if ((name = (p = path.split("/")).pop()).indexOf(".") > -1)
                    name = p.pop();
            }
    
            ddSFSelection.childNodes[1].setAttribute("caption", 
                apf.escapeXML("Selection: " + (name || "/")));
            
            if (ddSFSelection.value == "selection") {
                ddSFSelection.setAttribute("value", "");
                ddSFSelection.setAttribute("value", "selection");
            }
        }
    
        function getSelectedTreeNode() {
            var node = trFiles ? trFiles.selected : fs.model.queryNode("folder[1]");
            if (!node)
                node = trFiles.xmlRoot.selectSingleNode("folder[1]");
            while (node.tagName != "folder")
                node = node.parentNode;
            return node;
        }
    
        function toggleDialog(force, isReplace, noselect, callback) {
            draw();
    
            tooltipSearchInFiles.$ext.style.display = "none";
    
            if (!force && !winSearchInFiles.visible || force > 0) {
                if (winSearchInFiles.visible) {
                    txtSFFind.focus();
                    txtSFFind.select();
                    return;
                }
    
                var winFindReplace;
                try{ 
                    winFindReplace = findreplace.getElement("winSearchReplace");
                } catch(e) {}
                if (winFindReplace && winFindReplace.visible) {
                    findreplace.toggle(-1, null, true, function(){
                        toggleDialog(force, isReplace, noselect);
                    });
                    return;
                }
    
                winSearchInFiles.$ext.style.overflow = "hidden";
                winSearchInFiles.$ext.style.height =
                    winSearchInFiles.$ext.offsetHeight + "px";
    
                position = -1;
    
                var page = tabs.focussedPage;
                var editor = page && page.editor;
                if (editor && editor.type == "ace") {
                    var ace   = editor.ace;
    
                    if (!ace.selection.isEmpty()) {
                        txtSFFind.setValue(ace.getCopyText());
                        libsearch.setRegexpMode(txtSFFind, chkSFRegEx.checked);
                    }
                }
    
                searchRow.appendChild(winSearchInFiles);
                winSearchInFiles.show();
                txtSFFind.focus();
                txtSFFind.select();
    
                winSearchInFiles.$ext.scrollTop = 0;
                document.body.scrollTop = 0;
    
                // Animate
                anims.animateSplitBoxNode(winSearchInFiles, {
                    height         : winSearchInFiles.$ext.scrollHeight + "px",
                    duration       : 0.2,
                    timingFunction : "cubic-bezier(.10, .10, .25, .90)"
                }, function() {
                    winSearchInFiles.$ext.style.height = "";
                });
                
                btnCollapse.setValue(1);
            }
            else if (winSearchInFiles.visible) {
                if (txtSFFind.getValue())
                    libsearch.saveHistory(txtSFFind.getValue(), "searchfiles");
    
                // Animate
                winSearchInFiles.visible = false;

                winSearchInFiles.$ext.style.height =
                    winSearchInFiles.$ext.offsetHeight + "px";

                anims.animateSplitBoxNode(winSearchInFiles, {
                    height         : 0,
                    duration       : 0.2,
                    timingFunction : "ease-in-out"
                }, function(){
                    winSearchInFiles.visible = true;
                    winSearchInFiles.hide();
                    winSearchInFiles.parentNode.removeChild(winSearchInFiles);

                    winSearchInFiles.$ext.style[apf.CSSPREFIX + "TransitionDuration"] = "";

                    if (!noselect && tabs.focussedPage)
                        tabs.focusPage(tabs.focussedPage); 

                    setTimeout(function(){
                        callback
                            ? callback()
                            : apf.layout.forceResize();
                    }, 50);
                });
                
                btnCollapse.setValue(0);
            }
    
            return false;
        }
    
        function searchinfiles() {
            toggleDialog(1);
        }
    
        function getOptions() {
            return {
                query         : txtSFFind.getValue(),
                needle        : txtSFFind.getValue(),
                pattern       : txtSFPatterns.getValue(),
                casesensitive : chkSFMatchCase.checked,
                regexp        : chkSFRegEx.checked,
                replaceAll    : replaceAll,
                replacement   : txtSFReplace.getValue(),
                wholeword     : chkSFWholeWords.checked
            };
        }
    
        function execReplace(){
            replaceAll = true;
            execFind();
            replaceAll = false;
        }
    
        function execFind() {
            // Determine the scope of the search
            var path;
            if (ddSFSelection.value == "project") {
                path = "/";
            }
            else if (!trFiles) {
                var paths = settings.getJson("user/tree_selection");
                if (!paths || !(path = paths[0]))
                    return;
    
                var p;
                if ((name = (p = path.split("/")).pop()).indexOf(".") > -1)
                    name = p.pop();
            }
            if (!path) {
                var node = getSelectedTreeNode();
                path = node.getAttribute("path");
            }
    
            var options = getOptions();
            var query   = txtSFFind.getValue();
            
            options.query = query.replace(/\n/g, "\\n");
    
            // even if there's text in the "replace" field, don't send it when not replacing
            if (!replaceAll)
                options.replacement = "";
            
            // Open Console
            if (chkSFConsole.checked) 
                console.show();
            
            makeSearchResultsPanel(function(err, page){
                if (err) {
                    console.error("Error creating search panel");
                    return;
                }
                
                var editor     = page.editor;
                var session    = page.document.getSession();
                var acesession = session.session;
                var doc        = acesession.getDocument();
                var renderer   = editor.ace.renderer;
                
                if (settings.getBool("user/findinfiles/@clear"))
                    doc.setValue("");
                
                appendLines(doc, messageHeader(path, options));
    
                setHighlight(acesession, options.query);
                
                if (!session.searchInited) {
                    session.searchInited = true;
                    
                    function dblclick() {
                        if (page.isActive())
                            launchFileFromSearch(editor.ace);
                    }
                    
                    renderer.scroller.addEventListener("dblclick", dblclick);
                    editor.ace.container.addEventListener("keydown", function(e) {
                        if (e.keyCode == 13) { // ENTER
                            if (e.altKey === false) {
                                launchFileFromSearch(editor.ace);
                                returnFocus = false;
                            }
                            else {
                                editor.insert("\n");
                            }
                            return false;
                        }
                    });
                    
                    editor.ace.container.addEventListener("keyup", function(e) {
                        if (e.keyCode >= 37 && e.keyCode <= 40) { // KEYUP or KEYDOWN
                            if (settings.getBool("user/findinfiles/@consolelaunch")) {
                                launchFileFromSearch(editor.ace);
                                returnFocus = true;
                                return false;
                            }
                        }
                    });
                    
                    page.on("unload", function(){
                        renderer.scroller.removeEventListener("dblclick", dblclick);
                    });
                }
                
                if (ddSFSelection.value == "active") {
                    var filename = lastActiveAce && lastActiveAce.isActive() 
                        && lastActiveAce.path;
                    
                    if (!filename) {
                        appendLines(doc, "Error: There is no active file. "
                            + "Focus the editor you want to search and try again.\n");
                        return;
                    }
                    
                    options.pattern = fs.getFilename(filename);
                    options.path    = fs.getParentPath(filename);
                }
                else if (ddSFSelection.value == "open") {
                    var files = []
                    if (options.pattern) files.push(options.pattern);
                    tabs.getPages().forEach(function(page){
                        if (page.path) files.push(page.path);
                    });
                    
                    if (!files.length) {
                        appendLines(doc, "Error: There are no open files. "
                            + "Open some files and try again.\n");
                        return;
                    }
                    
                    options.pattern = files.join(",");
                }
        
                if (options.query.length === 0)
                    return;
                
                // Set loading indicator
                page.className.add("loading");
                
                // Regexp for chrooted path 
                var reBase = settings.getBool("user/findinfiles/@fullpath") 
                    ? false
                    : new RegExp("^" + util.escapeRegExp(find.basePath), "g");
                
                options.path = path;
                
                find.findFiles(options, function(err, stream) {
                    if (err) {
                        appendLines(doc, "Error executing search: " + err.message);
                        return;
                    }
                    
                    var firstRun = true;
                    stream.on("data", function(chunk){
                        if (firstRun && !settings.getBool("user/findinfiles/@scrolldown")) {
                            var currLength = doc.getLength() - 3; // the distance to the last message
                            editor.ace.scrollToLine(currLength, false, true);
                            firstRun = false;
                        }
                        appendLines(doc, 
                            reBase ? chunk.replace(reBase, "") : chunk);
                    });
                    stream.on("end", function(data){
                        page.className.remove("loading");
                        appendLines(doc, "\n");
                    });
                });
        
                libsearch.saveHistory(options.query, "searchfiles");
                position = 0;
        
                // ide.dispatchEvent("track_action", {type: "searchinfiles"});
            })
        }
    
        function launchFileFromSearch(editor) {
            var session = editor.getSession();
            var currRow = editor.getCursorPosition().row;
    
            var clickedLine = session.getLine(currRow).split(": "); // number:text
            if (clickedLine.length < 2) // some other part of the editor
                return;
    
            // "string" type is the parent filename
            while (currRow --> 0) {
                var token = session.getTokenAt(currRow, 0);
                if (token && token.type.indexOf("string") != -1)
                    break;
            }
    
            var path = editor.getSession().getLine(currRow);
    
            if (path.charAt(path.length - 1) == ":")
                path = path.substring(0, path.length-1);
    
            path = path.replace(new RegExp("^" 
                + util.escapeRegExp(find.basePath)), "");
            
            if (path.charAt(0) != "/")
                path = "/" + path;
            
            if (!path)
                return;
                
            var row = parseInt(clickedLine[0], 10) - 1;
            var range = editor.getSelectionRange();
            var offset = clickedLine[0].length + 2;
            
            tabs.open({
                path      : path,
                active    : true,
                document  : {}
            }, function(err, page){
                if (err) return;
                
                page.editor.setState(page.document, {
                    jump : {
                        row       : row,
                        column    : range.start.column - offset,
                        select    : {
                            row    : row,
                            column : range.end.column - offset
                        }
                    }
                });
                
                tabs.focusPage(returnFocus
                    ? searchPanel[chkSFConsole.checked]
                    : page);
            });
        }
    
        function appendLines(doc, content) {
            if (!content || (!content.length && !content.count)) // blank lines can get through
                return;
    
            if (typeof content != "string")
                content = content.join("\n");
    
            if (content.length > 0) {
                if (!settings.getBool("user/findinfiles/@scrolldown")) {
                    doc.ace.$blockScrolling++;
                    doc.insert({row: doc.getLength(), column: 0}, content);
                    doc.ace.$blockScrolling--;
                }
                else
                    doc.insert({row: doc.getLength(), column: 0}, content);
            }
        }
    
        function messageHeader(path, options) {
            var optionsDesc = [];
    
            if (options.regexp === true)
                optionsDesc.push("regexp");
            if (options.casesensitive === true)
                optionsDesc.push("case sensitive");
            if (options.wholeword === true)
                optionsDesc.push("whole word");
    
            if (optionsDesc.length > 0)
                optionsDesc = "(" + optionsDesc.join(", ") + ")";
            else
                optionsDesc = "";
    
            var replacement = "";
            if (replaceAll)
                replacement = "', replaced as '" + options.replacement ;
            
            if (ddSFSelection.value == "project")
                path = "the entire project";
            else if (ddSFSelection.value == "active")
                path = "the active file";
            else if (ddSFSelection.value == "open")
                path = "all open files";
    
            return "Searching for '" + options.query + replacement 
                + "' in " + path + " " + optionsDesc + "\n\n";
        }
    
        var searchPanel = {};
        function makeSearchResultsPanel(callback) {
            var page = searchPanel[chkSFConsole.checked];
            
            if (!page || !page.loaded) {
                searchPanel[chkSFConsole.checked] = tabs.open({
                    path     : "", // This allows the page to be saved
                    tab      : chkSFConsole.checked 
                        ? console.aml.selectSingleNode("tab").cloud9tab 
                        : tabs.getTabs()[0],
                    value    : -1,
                    active   : true,
                    document : {
                        title : "Search Results", 
                        "ace" : {
                            customType : "c9search", 
                            options    : { 
                                // showFoldWidgets   : true,
                                // selectionStyle    : false,
                                // showInvisibles    : false,
                                // showPrintMargin   : false,
                                // fadeFoldWidgets   : false,
                                useWrapMode         : true,
                                wrapToView          : true
                            }
                        }
                    }, 
                    editorType : "ace"
                }, function(err, page, done){
                    // Ref for appendLines
                    var doc = page.document.getSession().session.getDocument();
                    doc.ace = page.editor.ace;
                    
                    callback(err, page);
                    
                    done();
                });
            }
            else {
                tabs.focusPage(page);
                callback(null, page);
            }
        }
    
        function setHighlight(session, query) {
            if (chkSFRegEx.checked)
                query = new RegExp(query);
            
            if (session.c9SearchHighlight)
                session.c9SearchHighlight.setRegexp(query)
            else {
                session.highlight(query);
                session.c9SearchHighlight = session.$searchHighlight;
                session.$searchHighlight = null;
            }
        }
        
        /***** Lifecycle *****/
        
        plugin.on("load", function(){
            load();
        });
        plugin.on("enable", function(){
            
        });
        plugin.on("disable", function(){
            
        });
        plugin.on("unload", function(){
            loaded = false;
        });
        
        /***** Register and define API *****/
        
        /**
         * Draws the file tree
         * @event afterfilesave Fires after a file is saved
         *   object:
         *     node     {XMLNode} description
         *     oldpath  {String} description
         **/
        plugin.freezePublicAPI({
            /**
             * 
             */
            toggle : toggleDialog
        });
        
        register(null, {
            findinfiles: plugin
        });
    }
});
