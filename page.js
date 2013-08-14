define(function(require, exports, module) {
    main.consumes = [
        "plugin", "c9", "ui", "tabs", "ace", "anims"
    ];
    main.provides = ["pagebehavior"];
    return main;

    function main(options, imports, register) {
        var c9        = imports.c9;
        var Plugin    = imports.plugin;
        var ui        = imports.ui;
        var anims     = imports.anims;
        var tabs      = imports.tabs;
        var aceHandle = imports.ace;
        
        var css = require("text!./style.css");
        
        /***** Initialization *****/
        
        var handle = new Plugin("Ajax.org", main.consumes);
        // var emit   = handle.getEmitter();
        
        var divSplit, divButton;
        
        var loaded = false;
        function load(){
            if (loaded) return false;
            loaded = true;
            
            // Insert CSS
            ui.insertCss(css, options.staticPrefix, handle);

            tabs.on("page.create", function(e){
                var page = e.page;
                
                addInteraction(page);
                
                // Make sure that events are put on the button when the skin changes
                page.aml.on("$skinchange", function(){
                    addInteraction(page);
                })
            }, handle);
            
            tabs.on("page.after.close", function(e){
                if (e.last && canTabBeRemoved(e.page.tab, 1)) {
                    e.page.tab.aml.skipAnimOnce = true;
                    e.page.unload();
                    e.page.tab.unload();
                }
            }, handle);
        }
        
        function canTabBeRemoved(tab, min){
            if (!tab || tab.getPages().length > (min || 0)) 
                return false;
            
            var containers = tabs.containers;
            for (var i = 0; i < containers.length; i++) {
                if (ui.isChildOf(containers[i], tab.aml)) {
                    return containers[i]
                        .getElementsByTagNameNS(apf.ns.aml, "tab").length > 1
                }
            }
            return false;
        }
        
        function addInteraction(plugin){
            var page    = plugin.aml;
            var button  = page.$button;
            if (!button) return;

            var offsetX, offsetY, startX, startY, dragWidth;
            var mode, rightPadding, originalTab, btnPlus, tab;
            var started, tabWidth, leftPadding, leftPos, start, initMouse;
            var pages, clean, originalPosition, splitDirection, splitTab;
            
            function setOrderMode(toTab, e){
                mode = "order";
                clean && clean();
                
                // Set new tab
                tab = toTab;
                
                // Plus Button
                btnPlus = tab.$ext.querySelector(".plus_tab_button");
                
                // Attach page to tab
                if (e) {
                    var curpage  = tab.getPage();
                    if (curpage) {
                        var curbtn = curpage.$button;
                        ui.setStyleClass(curbtn, "", ["curbtn"]);
                    }
                    
                    ui.setStyleClass(page.$button, "curbtn");
                }
                
                var container = tab.$buttons;
                var nodes     = container.childNodes;
                var rect      = container.getBoundingClientRect();
                var btn       = (tab.getPage() || { $button: button }).$button;
                var diff      = ui.getWidthDiff(btn);
                
                var leftMargin   = parseInt(ui.getStyle(btn, "marginLeft"), 10) || 0;
                var rightMargin  = parseInt(ui.getStyle(btn, "marginRight"), 10) || 0;
                var maxWidth     = parseInt(ui.getStyle(btn, "maxWidth"), 10) || 150;
                if (maxWidth > 500) maxWidth = 150;
                
                leftPos      = rect.left;
                pages        = tab.getPages();
                leftPadding  = parseInt(ui.getStyle(container, "paddingLeft"), 10) || 0;
                rightPadding = (parseInt(ui.getStyle(container, "paddingRight"), 10) || 0) + 24;
                
                var maxTabWidth = Math.min(maxWidth + diff, 
                  ((rect.width - leftPadding - rightPadding + rightMargin) 
                    / (pages.length + (e ? 1 : 0))) - rightMargin); // If 'e' is set, we're adding another page to this tab
                var newTabWidth = maxTabWidth - diff;
                
                tabWidth     = maxTabWidth + leftMargin + rightMargin;
                
                // Get the positions info of the tab buttons
                var info = [];
                for (var i = nodes.length - 1; i >= 0; i--) {
                    if ((btn = nodes[i]).nodeType != 1) continue;
                    info.push([btn, btn.offsetLeft, btn.offsetTop, btn.offsetWidth]);
                };
                
                // Append the button to the button container
                if (e) {
                    tab.$buttons.appendChild(button);
                    info.push([button, 0, button.offsetTop, dragWidth]);
                }
                
                // Set the info
                var iter;
                while ((iter = info.pop())) {
                    btn = iter[0];
                    btn.style.left     = (iter[1]) + "px";
                    btn.style.top      = (iter[2]) + "px";
                    btn.style.width    = (iter[3] - ui.getWidthDiff(btn)) + "px";
                    btn.style.margin   = 0;
                    btn.style.position = "absolute";
                }
                
                start = function(){
                    // Remove from childNodes of old tab
                    var lastIndex = tab.childNodes.indexOf(page);
                    tab.childNodes.remove(page);
                }
                
                if (started)
                    start();
                
                // Set initial position
                if (e)
                    mouseMoveOrder(e, newTabWidth);
                
                apf.addListener(document, "mousemove", mouseMoveOrder);
                apf.addListener(document, "mouseup", mouseUpOrder);
                
                clean = function(change, callback){
                    if (change !== false) {
                        apf.removeListener(document, "mousemove", mouseMoveOrder);
                        apf.removeListener(document, "mouseup", mouseUpOrder);
                    }
                    
                    if (change === true) {
                        var maxTabWidth = Math.min(maxWidth + diff, 
                          ((rect.width - leftPadding - rightPadding + rightMargin) 
                            / tab.getPages().length) - rightMargin);
                        tabWidth = maxTabWidth + leftMargin + rightMargin;
                        
                        var cb = clean.bind(this, false);
                        return animatePages(cb, null, maxTabWidth - diff);
                    }
                    
                    if (curbtn && curpage == tab.getPage()) {
                        ui.setStyleClass(curbtn, "curbtn");
                        curbtn = null;
                    }
                    
                    for (var i = nodes.length - 1; i >= 0; i--) {
                        if ((btn = nodes[i]).nodeType != 1) continue;
                        btn.style.left     = 
                        btn.style.top      = 
                        btn.style.width    = 
                        btn.style.margin   = 
                        btn.style.position = "";
                    };
                }
            }
            
            function setSplitMode(e){
                mode = "split";
                
                // Div that shows where to insert split
                if (!divSplit) {
                    divSplit = document.createElement("div");
                    divSplit.className = "split-area";
                    document.body.appendChild(divSplit);
                }
                
                // Remove all pointer events from iframes
                var frames = document.getElementsByTagName("iframe");
                for (var i = 0; i < frames.length; i++)
                    frames[i].style.pointerEvents = "none";
                
                start = function(){
                    // Fixate current position and width
                    var rect = button.getBoundingClientRect();
                    button.style.left     = (rect.left) + "px";
                    button.style.top      = (rect.top) + "px";
                    button.style.width    = (dragWidth - ui.getWidthDiff(button)) + "px";
                    button.style.position = "absolute"
                    
                    // Attach page to body
                    if (!divButton) {
                        divButton = document.createElement("div");
                        document.body.appendChild(divButton);
                    }
                    var theme = aceHandle.theme || {};
                    divButton.className = 
                        (theme.isDark ? "dark " : "") + (theme.cssClass || "");
                    divButton.appendChild(button);
                    
                    // Remove from parent childNodes
                    tab.childNodes.remove(page);
                }
                
                apf.addListener(document, "mousemove", mouseMoveSplit);
                apf.addListener(document, "mouseup", mouseUpSplit);
                
                if (started)
                    start();
                    
                clean && clean(true);
                    
                clean = function(){
                    button.style.left     = 
                    button.style.top      = 
                    button.style.width    = 
                    button.style.margin   = 
                    button.style.position = "";
                    
                    divSplit.style.display = "none";
                    
                    apf.removeListener(document, "mousemove", mouseMoveSplit);
                    apf.removeListener(document, "mouseup", mouseUpSplit);
                }
                
                if (started) {
                    // Set initial position and detect immediate snap
                    if (mouseMoveSplit(e) === false)
                        return;
                }
            }
            
            function finish(){
                if (!initMouse) {
                    clean();
                    
                    button.style.zIndex        = 
                    button.style.pointerEvents = "";
                    
                    // Return all pointer events to iframes
                    var frames = document.getElementsByTagName("iframe");
                    for (var i = 0; i < frames.length; i++)
                        frames[i].style.pointerEvents = "";
                }
                
                page.$dragging = false;
            }
            
            button.addEventListener("mousedown", function(e){
                // Tab needs to support ordering
                if (!page.parentNode.$order || page.$dragging || e.button == 2)
                    return;
                
                // APF stuff
                page.$dragging = true;
                
                startX  = e.clientX; 
                startY  = e.clientY; 
                
                initMouse = function(){
                    // Calculate where on the button was clicked
                    var rect = button.getBoundingClientRect();
                    offsetX = startX - rect.left;
                    offsetY = startY - rect.top;
                    
                    // Prepare button for dragging
                    button.style.zIndex        = 100000;
                    button.style.pointerEvents = "none";
                    
                    // Initialize with order mode
                    setOrderMode(page.parentNode);
                    
                    initMouse = null;
                }
                
                // Use mine
                started = false;

                // Set current tab
                tab = plugin.tab.aml;
                
                // Store original info
                originalTab      = tab;
                originalPosition = button.nextSibling;
                dragWidth        = button.offsetWidth;
                
                apf.addListener(document, "mousemove", mouseMoveOrder);
                apf.addListener(document, "mouseup", mouseUpOrder);
            });
            
            function isNotSnapped(e, container){
                if (!container)
                    container = tab.$buttons;
                var rect = container.getBoundingClientRect();
                
                var x    = e.clientX;
                var y    = e.clientY;
                var diff = 10;
                
                return (
                    x < rect.left - diff || 
                    x > rect.left + rect.width + diff ||
                    y < rect.top - 5 || 
                    y > rect.top + rect.height + diff
                );
            }
            
            function showOrderPosition(idx, toWidth, finalize, finish){
                if (idx < 0) idx = 0;
                
                var orderPage = (pages[idx - 1] == page
                    ? pages[idx + 1]
                    : pages[idx]) || null;
                
                // Remove page from childNodes
                tab.childNodes.remove(page);
                
                if (finalize) {
                    // Get new pages with new order
                    pages = tab.getPages();
                    
                    // Reparent for real
                    var insert = pages[idx] && pages[idx].cloud9page;
                    plugin.attachTo(tab.cloud9tab, insert, true)
                }
                else {
                    // If we're already at this position do nothing
                    if (orderPage == page)
                        return;
                    
                    // Move page to new position
                    var idx = tab.childNodes.indexOf(orderPage);
                    if (idx > -1) tab.childNodes.splice(idx, 0, page);
                    else tab.childNodes.push(page);
                    
                    tab.$buttons.insertBefore(page.$button, 
                        orderPage && orderPage.$button || btnPlus);
                }
                
                // Patch + button which is changed to "" again
                // btnPlus.style.position = "absolute";
                // btnPlus.style.top      = "6px";
                
                animatePages(finish, finalize, toWidth);
            }
            
            function animatePages(finish, includePage, toWidth){
                // Get new pages array (with new order)
                pages = tab.getPages();
                pages.push({$button: btnPlus});

                // Animate all pages to their right position
                var p, tweens = [], offset = 0;
                for (var i = 0, l = pages.length; i < l; i++) {
                    p = pages[i];
                    
                    // Ignore the page we are dragging
                    if (!includePage && page === p) {
                        if (p.$button.parentNode == document.body)
                            offset = 1;
                        if (toWidth) 
                            p.$button.style.width = toWidth + "px";
                        continue;
                    }
                    
                    var toLeft  = leftPadding + ((i - offset) * tabWidth) + (!p.localName ? 9 : 0);
                    var curLeft = p.$button.offsetLeft;
                    if (toWidth || toLeft != curLeft) {
                        var tween = {
                            node     : p.$button,
                            duration : page === p ? 0.20 : 0.15,
                            timingFunction : page === p
                                ? "cubic-bezier(.30, .08, 0, 1)"
                                : "linear"
                        };
                        if (includePage || page !== p)
                            tween.left  = toLeft + "px";
                        if (toWidth && p.localName)
                            tween.width = toWidth + "px";
                        tweens.push(tween);
                    }
                }
                
                anims.animateMultiple(tweens, function(){
                    finish && finish();
                });
            }
            
            function mouseMoveOrder(e, toWidth){
                if (!e) e = event;
                
                if (!started) {
                    if (Math.abs(startX - e.clientX) < 4
                      && Math.abs(startY - e.clientY) < 4)
                        return;
                    started = true;
                    initMouse();
                    start();
                }
                
                if (isNotSnapped(e))
                    return setSplitMode(e);
                
                button.style.left = (e.clientX - leftPos - offsetX) + "px";
                
                var x   = button.offsetLeft - leftPadding + (tabWidth / 2);
                var idx = Math.floor(x / tabWidth);
                
                showOrderPosition(idx, toWidth);
            }
            
            function mouseUpOrder(e){
                apf.removeListener(document, "mousemove", mouseMoveOrder);
                apf.removeListener(document, "mouseup", mouseUpOrder);
                
                if (!started)
                    return finish();
                
                button.style.left = (e.clientX - leftPos - offsetX) + "px";
                
                var x   = button.offsetLeft - leftPadding + (tabWidth / 2);
                var idx = Math.floor(x / tabWidth);
                
                // Show final order
                var orderPage = showOrderPosition(idx, null, true, finish);
                
                // Activate page
                plugin.activate();
                
                // Remove tab if empty
                if (originalTab && canTabBeRemoved(originalTab.cloud9tab))
                    originalTab.cloud9tab.unload();
            }
            
            function showSplitPosition(e){
                var el = document.elementFromPoint(e.clientX, e.clientY);
                var aml = apf.findHost(el);
                
                while (aml && aml.localName != "tab")
                    aml = aml.parentNode;
                
                // If aml is not the tab we seek, lets abort
                if (!aml) {
                    divSplit.style.display = "none";
                    splitTab       = null;
                    splitDirection = null;
                    return;
                }
                
                var page = (aml.getPage() || {}).cloud9page;
                var dark = !page || page.className.names.indexOf("dark") > -1;
                divSplit.className = "split-area" + (dark ? " dark" : "");
                
                // Find the rotated quarter that we're in
                var rect = aml.$ext.getBoundingClientRect();
                var left   = (e.clientX - rect.left) / rect.width;
                var right  = 1 - left;
                var top    = (e.clientY - rect.top) / rect.height;
                var bottom = 1 - top;
                
                // Check whether we're going to dock
                if (!isNotSnapped(e, aml.$buttons)) {
                    setOrderMode(aml, e);
                    return false;
                }
                
                // Cannot split tab that would be removed later
                if (aml.getPages().length === 0) { // && aml == originalTab
                    divSplit.style.display = "none";
                    splitTab       = null;
                    splitDirection = null;
                    return;
                }
                splitTab = aml;
                
                // Anchor to closes side
                var min = Math.min(left, top, right, bottom);
                
                // Get buttons height
                var bHeight = tab.$buttons.offsetHeight - 1;
                
                // Left
                if (min == left) {
                    divSplit.style.left   = rect.left + "px";
                    divSplit.style.top    = (bHeight + rect.top) + "px";
                    divSplit.style.width  = (rect.width / 2) + "px";
                    divSplit.style.height = (rect.height - bHeight) + "px";
                    splitDirection = "w";
                }
                // Right
                else if (min == right) {
                    divSplit.style.left   = rect.left + (rect.width / 2) + "px";
                    divSplit.style.top    = (bHeight + rect.top) + "px";
                    divSplit.style.width  = (rect.width / 2) + "px";
                    divSplit.style.height = (rect.height - bHeight) + "px";
                    splitDirection = "e";
                }
                // Top
                else if (min == top) {
                    divSplit.style.left   = rect.left + "px";
                    divSplit.style.top    = (bHeight + rect.top) + "px";
                    divSplit.style.width  = rect.width + "px";
                    divSplit.style.height = ((rect.height / 2) - bHeight) + "px";
                    splitDirection = "n";
                }
                // Bottom
                else if (min == bottom) {
                    divSplit.style.left   = rect.left + "px";
                    divSplit.style.top    = (rect.top + (rect.height / 2)) + "px";
                    divSplit.style.width  = rect.width + "px";
                    divSplit.style.height = (rect.height / 2) + "px";
                    splitDirection = "s";
                }
                
                divSplit.style.cursor  = splitDirection + "-resize";
                divSplit.style.display = "block";
            }
            
            function mouseMoveSplit(e){
                if (!started) {
                    if (Math.abs(startX - e.clientX) < 4
                      && Math.abs(startY - e.clientY) < 4)
                        return;
                    started = true;
                    initMouse();
                    start();
                }
                
                button.style.left = (e.clientX - offsetX) + "px";
                button.style.top  = (e.clientY - offsetY) + "px";
                
                return showSplitPosition(e);
            }
            
            function mouseUpSplit(e){
                button.style.left = (e.clientX - offsetX) + "px";
                button.style.top  = (e.clientY - offsetY) + "px";
                
                apf.removeListener(document, "mousemove", mouseMoveSplit);
                apf.removeListener(document, "mouseup", mouseUpSplit);
                
                showSplitPosition(e);
                
                if (splitTab) {
                    splitTab = splitTab.cloud9tab;
                    var newTab;
                    if (splitDirection == "n")
                        newTab = splitTab.vsplit();
                    else if (splitDirection == "s")
                        newTab = splitTab.vsplit(true);
                    else if (splitDirection == "w")
                        newTab = splitTab.hsplit();
                    else if (splitDirection == "e")
                        newTab = splitTab.hsplit(true);
                    
                    var oldTab = tab;
                    plugin.attachTo(newTab, null, true);
                    tab = newTab.aml;
                    
                    if (oldTab && canTabBeRemoved(oldTab.cloud9tab)) {
                        oldTab.cloud9tab.unload();
                        originalTab = null;
                    }
                }
                else {
                    page.parentNode.$buttons.insertBefore(button,
                        originalPosition);
                }
                
                // Remove tab if empty
                if (originalTab && canTabBeRemoved(originalTab.cloud9tab))
                    originalTab.cloud9tab.unload();
                
                finish();
            }
        }
        
        /***** Methods *****/
        
        /***** Lifecycle *****/
        
        handle.on("load", function(){
            load();
        });
        handle.on("enable", function(){
            
        });
        handle.on("disable", function(){
            
        });
        handle.on("unload", function(){
            loaded = false;
        });
        
        /***** Register and define API *****/
        
        /**
         **/
        handle.freezePublicAPI({});
        
        register(null, {
            pagebehavior: handle
        });
    }
});