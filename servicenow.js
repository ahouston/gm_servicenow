// ==UserScript==
// @name       ServiceNow Autocomplete
// @namespace  https://github.com/ahouston/gm_servicenow
// @version    1.8.1
// @require    file://C:/GreaseMonkey/jquery.min.js
// @require    file://C:/GreaseMonkey/jquery.simulate.js
// @require    file://C:/GreaseMonkey/jquery-ui.js
// @resource   customCSS file://C:/GreaseMonkey/jquery-ui-1.10.3.custom.css
// @description ServiceNow Actions
// @include    https://didataservices.service-now.com/incident.do*
// @include    https://didataservices.service-now.com/u_request.do*
// @include    https://didataservices.service-now.com/change_request.do*
// @include    https://didataservices.service-now.com/task_time_worked.do*
// @include    https://didataservices.service-now.com/u_reminder.do*
// @updateURL  https://raw.github.com/ahouston/gm_servicenow/master/metadata.js
// @downloadURL https://raw.github.com/ahouston/gm_servicenow/master/servicenow.js
// @copyright  2013, Allan Houston
// ==/UserScript==

/*   ----------------
 * | Change History  |
 *   ----------------
 * 
 *  v1.8.1 ADD: Reminders for tickets
 *  v1.8.1 FIX: unsafeWindow for close function in Firefox
 *
 *  v1.8.0 ADD: Refresh icon, will refresh the current main pane
 *  v1.8.0 CHANGE: Collapsed the split_button.js code into the main GM script
 *  v1.8.0 CHANGE: Added code to hopefully deal with frame-in-frame problem in ServiceNow 
 *  
 *  v1.7.0 ADD: Added ability to interface with changes (CHM)
 *  v1.7.0 CHANGE: Collapsed lots of code into the autoClose() function, saves a lot of space
 * 
 *  v1.6.3 FIX: Removed a links from menu HRs
 *  v1.6.2 FIX: #AC.xxx.xxx DIVs and iFrames not being correctly hidden due to race condition in ac.setWidth(); 
 *              Cleaned up in the simMenu() function
 *
 *  v1.6.1 CHANGE: Testing auto-updates
 *
 *  v1.6   ADD: Moved to GitHub for updates
 * 
 *  v1.5   ADD: Script will now prompt and store your ServiceNow username for future use
 *  v1.5   ADD: You can change your username from the GreaseMonkey / Tampermonkey icon
 *
 *  v1.4.2 FIX:  Power regular expressions not specific enough
 *  v1.4.1 ADD:  Configuration change script for Bruce
 *  v1.4.1 FORK: Forked into Local Javascript and Remote Javascript versions
 * 
 *  v1.4: ADD:  Create control ticket automatically
 *  v1.4: ADD:  New simMenu functionality - now changes values using ServiceNows Javascript functions, much faster!
 *  v1.4: ADD:  Chainable waitForCSS and waitForValue functions to wait for either a field's CSS or value to i
 *              change (like the green bars on AJAX calls)
 *  
 *  v1.3: ADD: MAJOR rework, added support for SVRs as well as ICMs
 *  v1.3: ADD: Added Workload quick adds - will carry the Short Description into the window and add the correct hours
 *  v1.3: ADD: Added sections to drop down menu
 *
 *  v1.2: ADD: Automatically chooses "Close or cancel task" or "Set to closed" depending on the current status
 *  v1.2: FIX: Root cause "Configuration" regex not specific enough and matching multiple values. Tightened up.
 *  v1.2: ADD: "Close: Fibre Break - Line is stable" - for calls where we're cleaning up after a fibre break and 
 *              shutting individual tickets down.
 * 
 *  v1.1: FIX: Forced a trigger of "onchange" on the Closure and Root Cause textboxes so that values persist during save or update
 *  v1.1: ADD: "Close: No Response from Provider" and the three MACD closure processes.
 * 
 *  v1.0: Initial release
 * 
 */

/* Get or prompt for the user name */

var userName = GM_getValue ("userName", "");
    userName = fetchOrPrompt (userName,   "Your Name in ServiceNow", "userName");

var jsLogging = GM_getValue("jsLogging",true);

GM_registerMenuCommand ("Change ServiceNow Username", changeUsername);
GM_registerMenuCommand ("Toggle ServiceNow Javascript Logging", toggleLogging);

if (jsLogging == true) {
    
    	console.warn("Hijacking jslog()...");
        var oldJsLog = unsafeWindow.jslog;
        unsafeWindow.jslog = function() { }; // Do nothing
}

var thisURL  = document.location.href;

// Try to detect frame-in-frame issues here
var iframeHref = '';
try 		{ iframeHref = parent.frames['gsft_main'].location.href; } 
catch(err) 	{ console.warn('Error getting iframe href: ' + err.message);}

var thisUserVar = userName.replace(" ","_");
var doDebug = 0;


if (iframeHref.match(/^https?:\/\/didataservices.service-now.com\/nav.do/)) { 

	// We have a home.do in the gsft_main frame - reload the outer frame;
	
	alert("Detected frame-in-frame, going back!");
	iframeHref = parent.frames['gsft_main'].history.back(-1);

}
else if (thisURL.match(/^https?:\/\/didataservices.service-now.com\/(incident|u_request|change_request).do/)){ 

    //Only run on the location.do or urequest_do iFrame
    
    ///
    // Work out if we're an Incident (ICM) or Request (SVR)
    ///
    
    var incidentRequest = "";
    
    if (thisURL.match(/^https?:\/\/didataservices.service-now.com\/incident.do/)) { 
        incidentRequest = "incident";
    }
    else if (thisURL.match(/^https?:\/\/didataservices.service-now.com\/u_request.do/)) {
     	incidentRequest = "request";
    }
    else if (thisURL.match(/^https?:\/\/didataservices.service-now.com\/change_request.do/)) {
        incidentRequest = "change";
    }
    
    console.log("Starting GM Script for "+incidentRequest);

    // Load the jquery-ui css resource in

    var newCSS = GM_getResourceText ("customCSS");
    GM_addStyle (newCSS);

    var target=$("td.column_head:eq(2)");
    var existingInner = target.html();
    
    var newButton = '';
    
    
        
   	newButton += '<div id="split_button_div" style="width: 280px; display: none;"> ' +
    	'<div> ' +
        '<button id="close_call" style="background-image:url(https://ahouston.net/js/css/smoothness/images/close.png?moo=1213); background-repeat:no-repeat; background-position: left;">&nbsp; &nbsp; &nbsp;</button> ' +
        '<button id="refresh" style="background-image:url(https://ahouston.net/js/css/smoothness/images/refresh.png?moo=1213); background-repeat:no-repeat;">&nbsp; &nbsp;</button> ' +
        '<button id="rerun" disabled style="opacity: 1;">Actions</button> ' +
    	'<button id="select">Select an action</button> ' +
  		'</div> ' +
  		'<ul> ';
    
    if (incidentRequest == 'incident' || incidentRequest == 'request') { 
        
  	 newButton += ' <li><a id="no_fault_found" href="#">Close: No Fault Found</a></li> ' +
        	' <li><a id="no_response" href="#">Close: No Response from Provider</a></li> ' +
        	' <li><a id="bandwidth_utilisation" href="#">Close: Bandwidth Over Utilised</a></li> ' +
        	' <li><hr style=" color:#000000; border: 1px #000000;  height:1px; width:300px;"></li> ' +
        	' <li><a id="fibre_break_generic" href="#">Close: Fibre Break - Generic</a></li> ' +
        	' <li><a id="fibre_break_stable" href="#">Close: Fibre Break - Line is stable</a></li> ' +
        	' <li><hr style=" color:#000000; border: 1px #000000;  height:1px; width:350px;"></li> ' +
		' <li><a id="circuit_config_generic" href="#">Close: Circuit - Generic Configuration</a></li> ' +
		' <li><a id="hardware_failure" href="#">Close: Network: Hardware Failure</a></li> ' +
        	' <li><hr style=" color:#000000; border: 1px #000000;  height:1px; width:350px;"></li> ' +
        	' <li><a id="power_failure_generic" href="#">Close: Power Failure - General </a></li> ' +
        	' <li><a id="power_failure_ups" href="#">Close: Power Failure - UPS Exhausted</a></li> ' +
        	' <li><hr style=" color:#000000; border: 1px #000000;  height:1px; width:350px;"></li> ';
    }
    
    if (incidentRequest == 'incident' || incidentRequest == 'request' || incidentRequest == 'change') {
        
    newButton +=  ' <li><a id="macd_bandwidth" href="#">Close: MACD - Bandwidth Change</a></li> ' +
        	' <li><a id="macd_relocation" href="#">Close: MACD - Circuit Relocation</a></li> ' +
        	' <li><a id="macd_cancellation" href="#">Close: MACD - Circuit Cancellation</a></li> ' +
        	' <li><hr style=" color:#000000; border: 1px #000000;  height:1px; width:350px;"></li> ';
    }
    
    if (incidentRequest == 'incident' || incidentRequest == 'request' || incidentRequest == 'change') {
                
     newButton +=  ' <li><a id="new_workload1" class="workload" href="#">Workload: Add <b>1</b> hour for this ticket</a></li>'+
        	' <li><a id="new_workload2" class="workload" href="#">Workload: Add <b>2</b> hours for this ticket</a></li>'+
        	' <li><a id="new_workload3" class="workload" href="#">Workload: Add <b>3</b> hours for this ticket</a></li> ' +
         ' <li><hr style=" color:#000000; border: 1px #000000; height:1px; width:350px;"></li> ';
    }
   
    if (incidentRequest == 'incident' || incidentRequest == 'request' || incidentRequest == 'change') {

     newButton +=  ' <li><a id="reminder_allan" reminder_name="Allan Houston" class="reminder" href="#">Reminder: Add reminder - <b>Allan Houston</b> for this ticket</a></li>'+
                   ' <li><a id="reminder_bruce" reminder_name="Bruce Jelley" class="reminder" href="#">Reminder: Add reminder - <b>Bruce Jelley</b> for this ticket</a></li>'+
                   ' <li><a id="reminder_bruce" reminder_name="Kevin Naicker" class="reminder" href="#">Reminder: Add reminder - <b>Kevin Naicker</b> for this ticket</a></li>'+
                   ' <li><a id="reminder_bruce" reminder_name="Deon Naidoo" class="reminder" href="#">Reminder: Add reminder - <b>Deon Naidoo</b> for this ticket</a></li>'+
         ' <li><hr style=" color:#000000; border: 1px #000000; height:1px; width:350px;"></li> ';
    }

 
    if (incidentRequest == 'incident' || incidentRequest == 'request') {
        
     newButton +=  ' <li><a id="mc_control" href="#">Create: MetroConnect Control Ticket</a></li> ' +
        	' <li><hr style=" color:#000000; border: 1px #000000;  height:1px; width:350px;"></li> ';
	}
    
   	if (incidentRequest == 'change' && userName == 'Danni Manilall') {			// Only needed for Danni
        
     newButton +=  ' <li><a id="mc_control" href="#">Create: MetroConnect Control Ticket</a></li> ' +
        	' <li><hr style=" color:#000000; border: 1px #000000; margin: 5px 0px 0px 0px; height:1px; width:350px;"></li> ';
   }
    
    newButton +=   '</ul> ' + '</div>';    
        
    target.html(newButton + existingInner);
    setTimeout(function() { 
            $("#ui-id-1").css('position','absolute');
        	$("#ui-id-1").css('text-align','left');
			$("#split_button_div").css('display', 'inline-block');
    }, 500);
    

  	//  ---------------------------------
	// | Close fault with No Fault Found | 
	//  ---------------------------------
   
    
    
    
	$('#no_fault_found').click(function() {
 
        $("span:contains('Closure')").click();
        
        var tech_code = "Cisco";
        var tech_regex = /Cisco/ ;
        var resolution_code = "No Fault Found";
        var rootcause_code = "No Fault Found";
        var resolution_regex = /Remote support provided \> No fault found/;
        var rootcause_regex = /No fault foundNo fault found/;
        
        var rootcause_notes =  "No fault was found on the MetroConnect Network";
        var close_notes = "No fault was found on the MetroConnect Network";
        
        var nameRegex = new RegExp(userName,'i');
        // function autoClose(type,tech_regex,resolution_regex,rootcause_regex,rootcause_notes,close_notes) {
        
        autoClose(incidentRequest,tech_code,tech_regex,resolution_code,resolution_regex,rootcause_code,rootcause_regex,rootcause_notes,close_notes,nameRegex);
        		                
	});
    
    $('#no_response').click(function() {
 
        $("span:contains('Closure')").click();
        
        var tech_code = "Cisco";
        var tech_regex = /Cisco/ ;
        var resolution_code = "No Fault Found";
        var rootcause_code = "No Fault Found";
        var resolution_regex = /Remote support provided \> No fault found/;
        var rootcause_regex = /No fault foundNo fault found/;
        
        var rootcause_notes =  "No fault was found on the MetroConnect Network";
        var close_notes = "No response received from the ISP, closing with no fault found.";
        
        var nameRegex = new RegExp(userName,'i');
        
		autoClose(incidentRequest,tech_code,tech_regex,resolution_code,resolution_regex,rootcause_code,rootcause_regex,rootcause_notes,close_notes,nameRegex);
        
            
    });
    
    $('#bandwidth_utilisation').click(function() {
 
        $("span:contains('Closure')").click();
            
        var tech_code = "Cisco";
        var tech_regex = /Cisco/ ;
        var resolution_code = "Communications";
        var rootcause_code = "Bandwith Utilization";
        var resolution_regex = /Solution \> Communications/;
        var rootcause_regex = /Threshold \> Bandwith Utilization/;
        
        var rootcause_notes =  "High bandwidth utilisation on the EVC.";
        var close_notes = "Provided update to ISP regarding high bandwidth usage.";
        
        var nameRegex = new RegExp(userName,'i');
        
        autoClose(incidentRequest,tech_code,tech_regex,resolution_code,resolution_regex,rootcause_code,rootcause_regex,rootcause_notes,close_notes,nameRegex);
            
	});

	$('#fibre_break_generic').click(function() {
 
        $("span:contains('Closure')").click();
        
        var tech_code = "Cisco";
        var tech_regex = /Cisco/ ;
        var rootcause_code = "Fibre Optic Break";
        var resolution_code = "Damaged Fibre Cable";
		var rootcause_regex = /Carrier \> Fibre Optic Break/;
        var resolution_regex = /Cabling \> Damaged Fibre Cable/;

        var close_notes = "The fibre optic cable has been repaired, and service has been restored.";
        var rootcause_notes =  "The fibre optic cable was damaged.";
        
        
        var nameRegex = new RegExp(userName,'i');
        
        autoClose(incidentRequest,tech_code,tech_regex,resolution_code,resolution_regex,rootcause_code,rootcause_regex,rootcause_notes,close_notes,nameRegex);  
        
        
	});
    
    $('#fibre_break_stable').click(function() {
 
        $("span:contains('Closure')").click();
        
        var tech_code = "Cisco";
        var tech_regex = /Cisco/ ;
        var rootcause_code = "Fibre Optic Break";
        var resolution_code = "Damaged Fibre Cable";
		var rootcause_regex = /Carrier \> Fibre Optic Break/;
        var resolution_regex = /Cabling \> Damaged Fibre Cable/;

        var close_notes = "The fibre optic cable has been repaired, and service has been restored.\n\nThe circuit has been stable for a few days,closing call.";
        var rootcause_notes =  "The fibre optic cable was damaged.";
        
        
        var nameRegex = new RegExp(userName,'i');
        
        autoClose(incidentRequest,tech_code,tech_regex,resolution_code,resolution_regex,rootcause_code,rootcause_regex,rootcause_notes,close_notes,nameRegex);  
        
        
	});
    
    $('#circuit_config_generic').click(function() {
 
        $("span:contains('Closure')").click();
        
        var tech_code = "Cisco";
        var tech_regex = /Cisco/ ;
        var rootcause_code = "Configuration";
        var resolution_code = "Configuration change";
		var rootcause_regex = /^ConfigurationConfiguration/;
        var resolution_regex = /Dimension Data \> Remote \> Solution \> Configuration change/;

        var close_notes = "The EVC configuration has been updated.";
        var rootcause_notes =  "EVC configuration required.";
        
        
        var nameRegex = new RegExp(userName,'i');
        
        autoClose(incidentRequest,tech_code,tech_regex,resolution_code,resolution_regex,rootcause_code,rootcause_regex,rootcause_notes,close_notes,nameRegex);  
        
        
	});


    $('#hardware_failure').click(function() {

        $("span:contains('Closure')").click();

        var tech_code = "Cisco";
        var tech_regex = /Cisco/ ;
        var rootcause_code = "Hardware Failure";
        var resolution_code = "Hardware unit replaced";
        var rootcause_regex = /MEA root causes \> Hardware \> Hardware Failure/;
        var resolution_regex = /MEA resolution codes \> Onsite support provided \> Hardware unit replaced/;

        var close_notes = "The faulty hardware has been swapped out, and service has been restored.";
        var rootcause_notes =  "This was caused by a hardware fault on a MetroConnect device.";


        var nameRegex = new RegExp(userName,'i');

        autoClose(incidentRequest,tech_code,tech_regex,resolution_code,resolution_regex,rootcause_code,rootcause_regex,rootcause_notes,close_notes,nameRegex);


    });
    
    $('#power_failure_generic').click(function() {
 
        $("span:contains('Closure')").click();
        
        var tech_code = "Cisco";
        var tech_regex = /Cisco/ ;
        var rootcause_code = "Onsite power failure";
        var resolution_code = "Power Restored";
		var rootcause_regex = /MEA root causes \> Power \> Onsite power failure/;
        var resolution_regex = /Combination of remote and onsite support \> Power Restored/;

        var close_notes = "The power to site has been restored.";
        var rootcause_notes =  "The outage was caused by a general power failure in the area.";
        
        
        var nameRegex = new RegExp(userName,'i');
        
        autoClose(incidentRequest,tech_code,tech_regex,resolution_code,resolution_regex,rootcause_code,rootcause_regex,rootcause_notes,close_notes,nameRegex); 
        
	});

    $('#power_failure_ups').click(function() {
 
        $("span:contains('Closure')").click();
        
		var tech_code = "Cisco";
        var tech_regex = /Cisco/ ;
        var rootcause_code = "Onsite power failure";
        var resolution_code = "Power Restored";
		var rootcause_regex = /MEA root causes \> Power \> Onsite power failure/;
        var resolution_regex = /Combination of remote and onsite support \> Power Restored/;

        var close_notes = "The outage was caused by an extended power outage, causing the UPS batteries to deplete completely.";
        var rootcause_notes =  "The outage was caused by a general power failure in the area.";
        
        
        var nameRegex = new RegExp(userName,'i');
        
        autoClose(incidentRequest,tech_code,tech_regex,resolution_code,resolution_regex,rootcause_code,rootcause_regex,rootcause_notes,close_notes,nameRegex);       
        
	});
    
    $('#macd_bandwidth').click(function() {
 
        $("span:contains('Closure')").click();
        
		var tech_code = "Cisco";
        var tech_regex = /Cisco/ ;
        var rootcause_code = "Bandwith Utilization";
        var resolution_code = "Configuration changed/restored";
		var rootcause_regex = /Threshold \> Bandwith Utilization/;
        var resolution_regex = /Remote support provided \> Configuration changed\/restored/;

        var close_notes = "Bandwidth changed as per MACD request.";
        var rootcause_notes =  "MACD Request: Bandwidth Upgrade/Downgrade.";
        
        
        var nameRegex = new RegExp(userName,'i');
        
        autoClose(incidentRequest,tech_code,tech_regex,resolution_code,resolution_regex,rootcause_code,rootcause_regex,rootcause_notes,close_notes,nameRegex); 
            
            
	});
    
    $('#macd_relocation').click(function() {
 
        $("span:contains('Closure')").click();
       
		var tech_code = "Cisco";
        var tech_regex = /Cisco/ ;
        var rootcause_code = "Configuration";
        var resolution_code = "Configuration changed/restored";
		var rootcause_regex = /^ConfigurationConfiguration/;
        var resolution_regex = /Remote support provided \> Configuration changed\/restored/;

        var close_notes = "Circuits moved as per MACD request.";
        var rootcause_notes =  "MACD Request: Circuit move.";
        
        
        var nameRegex = new RegExp(userName,'i');
        
        autoClose(incidentRequest,tech_code,tech_regex,resolution_code,resolution_regex,rootcause_code,rootcause_regex,rootcause_notes,close_notes,nameRegex); 		                
	});
    
    $('#macd_cancellation').click(function() {
 
        $("span:contains('Closure')").click();
        
		var tech_code = "Cisco";
        var tech_regex = /Cisco/ ;
        var rootcause_code = "Configuration";
        var resolution_code = "Configuration changed/restored";
		var rootcause_regex = /^ConfigurationConfiguration/;
        var resolution_regex = /Remote support provided \> Configuration changed\/restored/;

        var close_notes = "Circuits cancelled as per MACD request.";
        var rootcause_notes =  "MACD Request: Circuit cancellation.";
        
        
        var nameRegex = new RegExp(userName,'i');
        
        autoClose(incidentRequest,tech_code,tech_regex,resolution_code,resolution_regex,rootcause_code,rootcause_regex,rootcause_notes,close_notes,nameRegex); 
		                
	});
    
    $('#mc_control').click(function() {
 
        var company_code = "Metroconnect (Control)";
        var company_regex = /Metroconnect \(Control\)/ ;
        
        // var company_code = "Metroconnect";
        // var company_regex = /Metroconnect \(Control\)/ ;
        
        
        var caller_code = "DD Engineer Metroconnect (Control)";
        var caller_regex = /DD Engineer Metroconnect \(Control\)/;
        
        var contract_code = "MEA.AF Time and Material contract";
        var contract_regex = /MEA.AF Time and Material contract/;
        
        var group_code = "Metro Connect.KN - Support";
        var group_regex = /Metro Connect.KN - Support/;
         
          
        var nameRegex = new RegExp(userName,'i');
        
        if (incidentRequest == "incident") { 
            
            $("#sys_display\\.incident\\.company").focus();
            triggerKeyEventsForString("#sys_display\\.incident\\.company","\b\b\b\b\b\b\b\b\b\b\b\b\b\b\b\b\b\b\b"+company_code,0,0,simMenu,company_regex);
           	
            
            waitForCss("#status\\.incident\\.company","background-color","#00CC00",function() { 
            $("#status\\.incident\\.assignment_group").css('background-color','#FFFFFF');
            $("#status\\.incident\\.assignment_group").removeClass('changed');
            
                // Wait for the company field to go green
                // Send the Contract now
                
                triggerKeyEventsForString("#sys_display\\.incident\\.u_contract","\b\b\b\b\b\b\b\b\b\b\b\b\b\b\b\b\b\b\b\b\b\b\b\b\b\b\b\b\b\b\b\b\b\b\b\b\b"+contract_code,0,0,simMenu,contract_regex);
                
                waitForCss("#status\\.incident\\.u_contract","background-color","#00CC00",function() {
                 
                    
                    // Wait for the contract field to complete
                	    
                    triggerKeyEventsForString("#sys_display\\.incident\\.u_caller","\b\b\b\b\b\b\b\b\b\b\b\b\b\b\b\b\b\b\b\b\b\b\b\b\b\b\b\b\b\b\b\b\b\b\b\b\b"+caller_code,0,0,simMenu,caller_regex);
					triggerKeyEventsForString("#sys_display\\.incident\\.assignment_group","\b\b\b\b\b\b\b\b\b\b\b\b\b\b\b\b\b\b\b\b\b\b\b\b\b\b\b\b\b\b\b\b\b\b\b\b\b"+group_code,0,0,simMenu,group_regex);
                    triggerKeyEventsForString("#sys_display\\.incident\\.u_owner_group","\b\b\b\b\b\b\b\b\b\b\b\b\b\b\b\b\b\b\b\b\b\b\b\b\b\b\b\b\b\b\b\b\b\b\b\b\b"+group_code,0,0,simMenu,group_regex);
					triggerKeyEventsForString("#sys_display\\.incident\\.u_responsible_owner_group","\b\b\b\b\b\b\b\b\b\b\b\b\b\b\b\b\b\b\b\b\b\b\b\b\b\b\b\b\b\b\b\b\b\b\b\b\b"+group_code,0,0,simMenu,group_regex);
					
                    //triggerKeyEventsForString("#sys_display\\.incident\\.u_assignment_group","\b\b\b\b\b\b\b\b\b\b\b\b\b\b\b\b\b\b\b\b\b\b\b\b\b\b\b\b\b\b\b\b\b\b\b\b\b"+group_code,0,0,simMenu,group_regex);	 
                    waitForValue("#sys_display\\.incident\\.assignment_group","Metro Connect.KN - Support",function() {
                       
                        triggerKeyEventsForString("#sys_display\\.incident\\.assigned_to","\b\b\b\b\b\b\b\b\b\b\b\b\b\b\b\b\b\b\b\b\b\b\b\b\b\b\b\b\b\b\b\b\b\b\b\b\b"+userName,0,0,simMenu,nameRegex);
                        $("#incident\\.u_next_step_displayed option:contains('Mark as responded')").attr('selected', 'selected').trigger('onchange');
                        $("#incident\\.u_accepted").val('1').trigger('onchange');
                        
                    });
                    
                });
            
            });
 
        }
        else if (incidentRequest == "request") { 
        
			$("#sys_display\\.u_request\\.company").focus();
            triggerKeyEventsForString("#sys_display\\.u_request\\.company","\b\b\b\b\b\b\b\b\b\b\b\b\b\b\b\b\b\b\b"+company_code,0,0,simMenu,company_regex);
           	
            
            waitForCss("#status\\.u_request\\.company","background-color","#00CC00",function() { 
            $("#status\\.u_request\\.assignment_group").css('background-color','#FFFFFF');
            $("#status\\.u_request\\.assignment_group").removeClass('changed');
            
                // Wait for the company field to go green
                // Send the Contract now
                
                triggerKeyEventsForString("#sys_display\\.u_request\\.u_contract","\b\b\b\b\b\b\b\b\b\b\b\b\b\b\b\b\b\b\b\b\b\b\b\b\b\b\b\b\b\b\b\b\b\b\b\b\b"+contract_code,0,0,simMenu,contract_regex);
                
                waitForCss("#status\\.u_request\\.u_contract","background-color","#00CC00",function() {
                 
                    
                    // Wait for the contract field to complete
                	    
                    triggerKeyEventsForString("#sys_display\\.u_request\\.u_caller","\b\b\b\b\b\b\b\b\b\b\b\b\b\b\b\b\b\b\b\b\b\b\b\b\b\b\b\b\b\b\b\b\b\b\b\b\b"+caller_code,0,0,simMenu,caller_regex);
					triggerKeyEventsForString("#sys_display\\.u_request\\.assignment_group","\b\b\b\b\b\b\b\b\b\b\b\b\b\b\b\b\b\b\b\b\b\b\b\b\b\b\b\b\b\b\b\b\b\b\b\b\b"+group_code,0,0,simMenu,group_regex);
                    triggerKeyEventsForString("#sys_display\\.u_request\\.u_owner_group","\b\b\b\b\b\b\b\b\b\b\b\b\b\b\b\b\b\b\b\b\b\b\b\b\b\b\b\b\b\b\b\b\b\b\b\b\b"+group_code,0,0,simMenu,group_regex);
					triggerKeyEventsForString("#sys_display\\.u_request\\.u_responsible_owner_group","\b\b\b\b\b\b\b\b\b\b\b\b\b\b\b\b\b\b\b\b\b\b\b\b\b\b\b\b\b\b\b\b\b\b\b\b\b"+group_code,0,0,simMenu,group_regex);
					
                    //triggerKeyEventsForString("#sys_display\\.u_request\\.u_assignment_group","\b\b\b\b\b\b\b\b\b\b\b\b\b\b\b\b\b\b\b\b\b\b\b\b\b\b\b\b\b\b\b\b\b\b\b\b\b"+group_code,0,0,simMenu,group_regex);	 
                    waitForValue("#sys_display\\.u_request\\.assignment_group","Metro Connect.KN - Support",function() {
                       
                        triggerKeyEventsForString("#sys_display\\.u_request\\.assigned_to","\b\b\b\b\b\b\b\b\b\b\b\b\b\b\b\b\b\b\b\b\b\b\b\b\b\b\b\b\b\b\b\b\b\b\b\b\b"+userName,0,0,simMenu,nameRegex);
                        $("#u_request\\.u_next_step_displayed option:contains('Mark as responded')").attr('selected', 'selected').trigger('onchange');
                        $("#u_request\\.u_accepted").val('Accepted').trigger('onchange');
                        
                    });
                    
                });
            
            });

            
        }
        else if (incidentRequest == "change") { 
        
	    $("#sys_display\\.change_request\\.company").focus();
            triggerKeyEventsForString("#sys_display\\.change_request\\.company","\b\b\b\b\b\b\b\b\b\b\b\b\b\b\b\b\b\b\b"+company_code,0,0,simMenu,company_regex);
           	
            
            waitForCss("#status\\.change_request\\.company","background-color","#00CC00",function() { 
            $("#status\\.change_request\\.assignment_group").css('background-color','#FFFFFF');
            $("#status\\.change_request\\.assignment_group").removeClass('changed');
            
                // Wait for the company field to go green
                // Send the Contract now
                
                triggerKeyEventsForString("#sys_display\\.change_request\\.u_contract","\b\b\b\b\b\b\b\b\b\b\b\b\b\b\b\b\b\b\b\b\b\b\b\b\b\b\b\b\b\b\b\b\b\b\b\b\b"+contract_code,0,0,simMenu,contract_regex);
                
                waitForCss("#status\\.change_request\\.u_contract","background-color","#00CC00",function() {
                 
                    
                    // Wait for the contract field to complete
                	    
                    triggerKeyEventsForString("#sys_display\\.change_request\\.u_caller","\b\b\b\b\b\b\b\b\b\b\b\b\b\b\b\b\b\b\b\b\b\b\b\b\b\b\b\b\b\b\b\b\b\b\b\b\b"+caller_code,0,0,simMenu,caller_regex);
					triggerKeyEventsForString("#sys_display\\.change_request\\.assignment_group","\b\b\b\b\b\b\b\b\b\b\b\b\b\b\b\b\b\b\b\b\b\b\b\b\b\b\b\b\b\b\b\b\b\b\b\b\b"+group_code,0,0,simMenu,group_regex);
                    triggerKeyEventsForString("#sys_display\\.change_request\\.u_owner_group","\b\b\b\b\b\b\b\b\b\b\b\b\b\b\b\b\b\b\b\b\b\b\b\b\b\b\b\b\b\b\b\b\b\b\b\b\b"+group_code,0,0,simMenu,group_regex);
					triggerKeyEventsForString("#sys_display\\.change_request\\.u_responsible_owner_group","\b\b\b\b\b\b\b\b\b\b\b\b\b\b\b\b\b\b\b\b\b\b\b\b\b\b\b\b\b\b\b\b\b\b\b\b\b"+group_code,0,0,simMenu,group_regex);
					
                    waitForValue("#sys_display\\.change_request\\.assignment_group","Metro Connect.KN - Support",function() {
                       
                        triggerKeyEventsForString("#sys_display\\.change_request\\.u_responsible_owner","\b\b\b\b\b\b\b\b\b\b\b\b\b\b\b\b\b\b\b\b\b\b\b\b\b\b\b\b\b\b\b\b\b\b\b\b\b"+userName,0,0,simMenu,nameRegex);
                        $("#change_request\\.u_next_step_displayed option:contains('Mark as responded')").attr('selected', 'selected').trigger('onchange');
                        $("#change_request\\.u_accepted").val('Accepted').trigger('onchange');
                        
                    });
                    
                });
            
            });

            
        }
		  
		
	});
    
    $('a.workload').click(function() {
 		
        var workloadID = $(this).attr("id");
        var numHours = workloadID.charAt( workloadID.length-1 )
        
        $("span:contains('Workload')").click();
        
        
        GM_setValue(thisUserVar+"_num_hours", numHours);
        
        if (incidentRequest == "incident") {
            GM_setValue(thisUserVar+"_short_desc", $("input#incident\\.short_description").val());
        	$("a[data-list_id='incident.task_time_worked.task'] + button#sysverb_new").click();
        } 
        else if (incidentRequest == "request") {
            GM_setValue(thisUserVar+"_short_desc", $("input#u_request\\.short_description").val());
         	$("a[data-list_id='u_request.task_time_worked.task'] + button#sysverb_new").click();   
        }
	else if (incidentRequest == "change") {
            GM_setValue(thisUserVar+"_short_desc", $("input#change_request\\.short_description").val());
                $("a[data-list_id='change_request.task_time_worked.task'] + button#sysverb_new").click();   
        }
    });


    $('a.reminder').click(function() {

	/* Get the reminder name from the reminder_name attr */

        var reminderName = $(this).attr("reminder_name");
        
        
        $("span:contains('Reminder')").click();


        GM_setValue(thisUserVar+"_reminder_name", reminderName);

        if (incidentRequest == "incident") {
            GM_setValue(thisUserVar+"_reminder_desc", $("input#incident\\.short_description").val());
                $("a[data-list_id='incident.u_reminder.u_task'] + button#sysverb_new").click();
        }
        else if (incidentRequest == "request") {
            GM_setValue(thisUserVar+"_reminder_desc", $("input#u_request\\.short_description").val());
                $("a[data-list_id='u_request.u_reminder.u_task'] + button#sysverb_new").click();
        }
	else if (incidentRequest == "change") {
            GM_setValue(thisUserVar+"_reminder_desc", $("input#change_request\\.short_description").val());
                $("a[data-list_id='change_request.u_reminder.u_task'] + button#sysverb_new").click();
        }
    });
    

}

// Do Workloads

else if (thisURL.match(/^https?:\/\/didataservices.service-now.com\/task_time_worked.do/)){ 
    
    var shortDescription = GM_getValue(thisUserVar+"_short_desc");
    var numHours = GM_getValue(thisUserVar+"_num_hours",1);
    //alert("Got numHours = " + numHours);
    
    $("#task_time_worked\\.comments").val(shortDescription).trigger("onchange");
    
    setTimeout(function () {
    	$("#ni\\.task_time_worked\\.time_workeddur_hour").val(numHours).trigger("onblur");
    },250);
    
    GM_deleteValue(thisUserVar+"_short_desc");
    GM_deleteValue(thisUserVar+"_num_hours");
}

else if (thisURL.match(/^https?:\/\/didataservices.service-now.com\/u_reminder.do/)){

    var reminderDesc = GM_getValue(thisUserVar+"_reminder_desc");
    var reminderName = GM_getValue(thisUserVar+"_reminder_name",1);
    var reminderRegex = new RegExp(reminderName,'i');
	if (reminderName == 1) { return; }					// It needs to be set to a name.
    
    var group_code = "Metro Connect.KN - Support";
    var group_regex = /Metro Connect.KN - Support/;  
 

    $("#u_reminder\\.u_description").val(reminderDesc).trigger("onchange");

    triggerKeyEventsForString("#sys_display\\.u_reminder\\.u_user",
	 "\b\b\b\b\b\b\b\b\b\b\b\b\b\b\b\b\b\b\b\b\b\b\b\b\b\b\b\b\b\b\b\b\b\b\b\b\b"+reminderName,
	 0,0,simMenu,reminderRegex);

    triggerKeyEventsForString("#sys_display\\.u_reminder\\.u_group",
	"\b\b\b\b\b\b\b\b\b\b\b\b\b\b\b\b\b\b\b\b\b\b\b\b\b\b\b\b\b\b\b\b\b\b\b\b\b"+group_code,
	0,0,simMenu,group_regex);

    setTimeout(function () { $("img[title='Choose date...']").trigger("click");   },1500);
        
    GM_deleteValue(thisUserVar+"_reminder_desc");
    GM_deleteValue(thisUserVar+"_reminder_name");
}

/*  --------- 
 *  Functions 
 *  --------- 
 */
 

function autoClose(incidentRequest,tech_code,tech_regex,resolution_code,resolution_regex,rootcause_code,rootcause_regex,rootcause_notes,close_notes,nameRegex,change_outcome,change_regex) {

    // Autocomplete an incident, request or change
    
    var type = incidentRequest;
    var change_outcome 	= typeof change_outcome !== 'undefined' ? change_outcome 	: 'Change was completed successfully';
    var change_regex 	= typeof change_regex 	!== 'undefined' ? change_regex 		: /MEA change outcomes \> Change was completed successfully/;
    
   	if (type == "incident") { 
            
        	triggerKeyEventsForString("#sys_display\\.incident\\.u_technology","\b\b\b\b\b\b"+tech_code,0,0,simMenu,tech_regex);
			triggerKeyEventsForString("#sys_display\\.incident\\.u_task_resolution_code","\b\b\b\b\b\b\b\b\b\b\b\b\b\b\b\b\b\b\b\b\b\b\b\b\b\b\b\b\b\b\b\b\b\b\b\b\b"+resolution_code,0,0,simMenu,resolution_regex);
        	triggerKeyEventsForString("#sys_display\\.incident\\.u_task_rootcause","\b\b\b\b\b\b\b\b\b\b\b\b\b\b\b\b\b\b\b\b\b\b\b\b\b\b\b\b\b\b\b\b\b\b\b\b\b\b\b\b"+rootcause_code,0,0,simMenu,rootcause_regex);
        	$("#incident\\.u_root_cause_comments").val(rootcause_notes).trigger("onchange");
            $("#incident\\.close_notes").val(close_notes).trigger("onchange");
            
        	triggerKeyEventsForString("#sys_display\\.incident\\.u_resolved_by","\b\b\b\b\b\b\b\b\b\b\b\b\b\b\b\b\b\b\b\b\b\b\b\b\b\b\b\b\b\b\b\b\b\b\b\b\b"+userName,0,0,simMenu,nameRegex);
            $("#incident\\.u_next_step_displayed option:contains('Close or cancel task')").attr('selected', 'selected').trigger('onchange');
        	$("#incident\\.u_next_step_displayed option:contains('Set to closed')").attr('selected', 'selected').trigger('onchange');
        }
	else if (type == "request") { 
        
			triggerKeyEventsForString("#sys_display\\.u_request\\.u_technology","\b\b\b\b\b\b"+tech_code,0,0,simMenu,tech_regex);
			triggerKeyEventsForString("#sys_display\\.u_request\\.u_task_resolution_code","\b\b\b\b\b\b\b\b\b\b\b\b\b\b\b\b\b\b\b\b\b\b\b\b\b\b\b\b\b\b\b\b\b\b\b\b\b"+resolution_code,0,0,simMenu,resolution_regex);
			$("#u_request\\.close_notes").val(close_notes).trigger("onchange");

			triggerKeyEventsForString("#sys_display\\.u_request\\.u_resolved_by","\b\b\b\b\b\b\b\b\b\b\b\b\b\b\b\b\b\b\b\b\b\b\b\b\b\b\b\b\b\b\b\b\b\b\b\b\b"+userName,0,0,simMenu,nameRegex);
			$("#u_request\\.u_next_step_displayed option:contains('Close or cancel task')").attr('selected', 'selected').trigger('onchange');
			$("#u_request\\.u_next_step_displayed option:contains('Set to closed')").attr('selected', 'selected').trigger('onchange');
            
    }
    else if (type == "change") { 
        
                    
			triggerKeyEventsForString("#sys_display\\.change_request\\.u_technology","\b\b\b\b\b\b"+tech_code,0,0,simMenu,tech_regex);
			triggerKeyEventsForString("#sys_display\\.change_request\\.u_change_outcome","\b\b\b\b\b\b\b\b\b\b\b\b\b\b\b\b\b\b\b\b\b\b\b\b\b\b\b\b\b\b\b\b\b\b\b\b\b"+change_outcome,0,0,simMenu,change_regex);
            $("#change_request\\.close_notes").val(close_notes).trigger("onchange");
			$("#change_request\\.u_review_comments").val(rootcause_notes).trigger("onchange");

			triggerKeyEventsForString("#sys_display\\.change_request\\.u_resolved_by","\b\b\b\b\b\b\b\b\b\b\b\b\b\b\b\b\b\b\b\b\b\b\b\b\b\b\b\b\b\b\b\b\b\b\b\b\b"+userName,0,0,simMenu,nameRegex);
        	triggerKeyEventsForString("#sys_display\\.change_request\\.u_reviewed_by","\b\b\b\b\b\b\b\b\b\b\b\b\b\b\b\b\b\b\b\b\b\b\b\b\b\b\b\b\b\b\b\b\b\b\b\b\b"+userName,0,0,simMenu,nameRegex);
			$("#change_request\\.u_next_step_displayed option:contains('Close or cancel task')").attr('selected', 'selected').trigger('onchange');
			$("#change_request\\.u_next_step_displayed option:contains('Set to closed')").attr('selected', 'selected').trigger('onchange');
            
	}
        
        
        
}
 
function cleanDivs() {


        // Attempt to hide all #AC. divs and iFrames
            
        $('div[id^="AC"]').each(function() { $(this).css('display','none'); });
        $('iframe[id^="AC"]').each(function() { $(this).css('display','none'); });
           
}
    
function waitForCss(selector,attribute,value,call_back,poll_time,max_time) {

    // This polls for the jQuery selector until a specific attribute is attained
    // Used to check for the green bars next to correctly AJAXed fields for example
    
    poll_time = typeof poll_time !== 'undefined' ? poll_time : 100;
    max_time = typeof max_time !== 'undefined' ? max_time : 10000;
    call_back = typeof call_back !== 'function' ? function() { console.error("Error: Callback isn't a function!"); } : call_back;
    
    var start = new Date().getTime();
    var found = 0;
    var timed_out = 0;
   
    var myInterval = setInterval(function() { 
    
        if ($(''+selector).length > 0) { 
      
            var elapsed = new Date().getTime() - start;
            var currValue = $(''+selector).css(attribute);

            currValue = currValue.match(/rgb/i) ? rgbToHex(currValue,true) : currValue;
            
            if (currValue == value) { 

                console.log("waitForCSS: Found " + attribute + " = " + value + " for " + selector + " in " + elapsed + " milliseconds.");
                found = 1;            
                clearInterval(myInterval);
                call_back();				// Call the call_back function
            }
            
            if (elapsed > max_time) { 
             
                console.log("waitForCSS: Timed out waiting for " + attribute + " = " + value + " for " + selector + " in " + elapsed + " milliseconds.");
                timed_out = 1;
                clearInterval(myInterval);
            }
            // console.log("warForCSS: Debug: " + attribute + " = " + currValue + " for " + selector + " in " + elapsed + " milliseconds.");
        }
        else { console.log("Couldn't find the jQuery element: " + selector); }
        
    },poll_time);
    
    
}

function waitForValue(selector,value,call_back,poll_time,max_time) {

    // This polls for the jQuery selector until a specific attribute is attained
    // Used to check for the green bars next to correctly AJAXed fields for example
    
    poll_time = typeof poll_time !== 'undefined' ? poll_time : 100;
    max_time = typeof max_time !== 'undefined' ? max_time : 10000;
    call_back = typeof call_back !== 'function' ? function() { console.error("Error: Callback isn't a function!"); } : call_back;
    
    var start = new Date().getTime();
    var found = 0;
    var timed_out = 0;
   
    var myInterval = setInterval(function() { 
    
        if ($(''+selector).length > 0) { 
      
            var elapsed = new Date().getTime() - start;
            var currValue = $(''+selector).val();

            currValue = currValue.match(/rgb/i) ? rgbToHex(currValue,true) : currValue;
            
            if (currValue == value) { 

                console.log("waitForValue: Found "  + value + " for " + selector + " in " + elapsed + " milliseconds.");
                found = 1;            
                clearInterval(myInterval);
                call_back();				// Call the call_back function
            }
            
            if (elapsed > max_time) { 
             
                console.log("waitForValue: Timed out waiting for " + value + " for " + selector + " in " + elapsed + " milliseconds.");
                timed_out = 1;
                clearInterval(myInterval);
            }
            // console.log("warForValue: Debug: " + attribute + " = " + currValue + " for " + selector + " in " + elapsed + " milliseconds.");
        }
        else { console.log("Couldn't find the jQuery element: " + selector); }
        
    },poll_time);
    

}



function simMenu(field,regex) {
	
    console.warn("simMenu running for "+field.attr("id")+", with regex: "+regex);
    
    // Lets hijack the AJAXCompleter.setWidth function
  
    var mID = field.attr("id");
    var jackObject = unsafeWindow.document.getElementById(''+mID);
    
    if (jQuery.isFunction(jackObject.ac.setWidth)) { 
        // Firefox doesn't keep a [0] DOM object
    }
    else if (jQuery.isFunction(jackElement[0].ac.setWidth)) {
        // Chrome does keep a [0] DOM object
        jackObject = jackElement[0];
    }
    else {
        console.warn("Doh! Couldn't find the setWidth function!");
    }
    
    if (doDebug) { console.log("This is jackObject"); }
    if (doDebug) { console.log(jackObject); }
    jackObject.ac.onFocus();
    
    if (jQuery.isFunction(jackObject.ac.setWidth)) {
       
        var oldObject = {};	 jQuery.extend(oldObject,jackObject.ac);
    	var numJacks = 0;
        
        jackObject.ac.setWidth  = function(w) {
            
            if (doDebug) { console.log("Inside setWidth()"); }
            
            var fieldSelector = field.selector.replace(/\\/g,'\\\\');
       		var divID = fieldSelector.replace("#sys_display","#AC");
            var shimID = divID + "_shim";
            
            var numMenuItems = jackObject.ac.currentMenuCount;
            var menuItems = jackObject.ac.getMenuItems();
            
            var matchFound = 0;
            var selectOption = 0;
            
            for (var i=0; i < numMenuItems; i++) { 
            	if (doDebug) {  console.log("i=" +i); }
                var line = (menuItems[i].innerText || menuItems[i].textContent);
                if (doDebug) { console.log("Line: " + line + "\nRegex: " + regex); }
                    
                    if (line.match(regex)) {
                    	if (matchFound) { 
                    	   if (doDebug) { console.log("Error: Multiple matches for regex: " +regex); }
                    	   return;
                    	}
                        selectOption = i+1;
                        matchFound = 1;
                    }
            }
            
            if (doDebug) { console.log("Found match at index: " + selectOption); console.log("Firing key presses..."); }
            
            
           	for (var i=0;i<selectOption;i++) {
				if (doDebug) { console.log("["+field+"] Pressing DOWN..."); }
				triggerKeyEvents(field,keysim.keyCode.DOWN);
			}
			
			if (doDebug) { console.log("["+field+"] Pressing ENTER"); }
            triggerKeyEvents(field,keysim.keyCode.ENTER);
            if (doDebug) { console.log("Calling old setWidth("+w+")..."); }
            oldObject.setWidth(0);
			
            
            //console.log("Hiding " + shimID); console.log($(''+shimID)); $(''+shimID).css('display','none');
            //console.log("Hiding " + divID);  $(""+divID+"").css('display','none');
            
            if (matchFound == 0) { console.warn("Error matching regular expression" + regex); }
            
            // Attempt to hide all #AC. divs and iFrames
            
            cleanDivs();
            
            //$('div[id^="AC"]').each(function() { $(this).css('display','none'); });
            //$('iframe[id^="AC"]').each(function() { $(this).css('display','none'); });
            
		};
    }
    else { 
     
   		console.warn("Hijack unsuccessful for element '" +field+ "' : "  + jackObject.ac.setWidth); 
    }
} 



var HTML5_TEXT_INPUT_FIELD_SELECTOR = 'input:text,input:password,input[type=email],' + 'input[type=number],input[type=search],input[type=tel],' + 'input[type=time],input[type=url]'; 

/** * Utility function to trigger a key press event for each character * in a string.  Each character will be triggered 'keyTiming' * milliseconds apart.  The onComplete function will be called  * 'keyTiming' milliseconds after the last key is triggered. */

//  -------------------------------------
//   Convert RGB Colors to Hex
//   http://jsfiddle.net/Xotic750/u6LCD/
//  -------------------------------------

var rgbToHex = (function () {
    var rx = /^rgb\s*\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*\)$/i;

    function pad(num) {
        if (num.length === 1) {
            num = "0" + num;
        }
        return num;
    }

    return function (rgb, uppercase) {
        var rxArray = rgb.match(rx),
            hex;

        if (rxArray !== null) {
            hex = pad(parseInt(rxArray[1], 10).toString(16)) + pad(parseInt(rxArray[2], 10).toString(16)) + pad(parseInt(rxArray[3], 10).toString(16));

            if (uppercase === true) {
                hex = hex.toUpperCase();
            }
            return "#" + hex;
        }
        return;
    };
}());

// --------------------------------
//  Simulate Key Strokes
// --------------------------------


function triggerKeyEventsForString(field, str, keyTiming, triggerFocus, onComplete,regex) {
      
    if (field && str) {
        field = $(field);
        
        triggerFocus = Boolean(triggerFocus);
        if (triggerFocus) {
            field.trigger('focus');
        }
        var keyCode = str.charCodeAt(0);
        triggerKeyEvents(field, keyCode);
        if (str.length > 1) {
            setTimeout(function () {
                triggerKeyEventsForString(field, str.substring(1), keyTiming, false, onComplete,regex);
            }, keyTiming);
        } else {
                       
            if (jQuery.isFunction(onComplete)) {
                
                setTimeout(function () {
                    onComplete(field,regex);
                }, keyTiming);
            }
        }
    }
} /** * Utility function to trigger a key event for a given key code. */

function triggerKeyEvents(field, keyCode, shiftKey, ctrlKey) {
    field = $(field);
    shiftKey = Boolean(shiftKey);
    ctrlKey = Boolean(ctrlKey);
    field.simulate("keydown", {
        keyCode: keyCode,
        ctrlKey: ctrlKey,
        shiftKey: shiftKey
    });
    field.simulate("keypress", {
        keyCode: keyCode,
        ctrlKey: ctrlKey,
        shiftKey: shiftKey
    });
    if (field.is(HTML5_TEXT_INPUT_FIELD_SELECTOR)) {
        applyKeyCodeToValue(field, keyCode);
    }
    field.simulate("keyup", {
        keyCode: keyCode,
        ctrlKey: ctrlKey,
        shiftKey: shiftKey
    });
} /* * Internal function to simulate a key being typed into an edit  * field for testing purposes.  Tries to handle cases like  * 'backspace' or 'arrow key'.  It's assumed that the cursor is * always at the end of the field. */

function applyKeyCodeToValue(field, keyCode) {
    field = $(field);
    if ((keyCode >= 32) && (keyCode <= 126)) {
        field.val(field.val() + String.fromCharCode(keyCode));
    } else {
        switch (keyCode) {
        case 8: // Backspace                
            var val = field.val();
            if (val.length) {
                field.val(val.substring(0, val.length - 1));
            }
            break;
        default:
            break;
        }
    }
}

function fetchOrPrompt (targVar, userPrompt, setValVarName) {
    if (targVar) {
        targVar     = targVar;
    }
    else {
        targVar     = prompt (
            userPrompt + ' not set for ' + location.hostname + '. Please enter it now:',
            ''
        );
        GM_setValue (setValVarName,targVar );
    }
    return targVar;
}

function changeUsername () {
    promptAndChangeStoredValue (userName,"Your Name in ServiceNow", "userName");
}


function promptAndChangeStoredValue (targVar, userPrompt, setValVarName) {
    targVar     = prompt (
        'Change ' + userPrompt +' :',
        targVar
    );
    GM_setValue (setValVarName, targVar );
}

function toggleLogging() {
 
    if (jsLogging == true) { 
    	
        alert("Setting ServiceNow logging: OFF\n\nThis will remove the hijack of jslog();");
        GM_setValue("jsLogging",false);
        
    }
    else {
        alert("Setting ServiceNow logging: ON\n\nThis hijack the function jslog() to improve speed.");
        GM_setValue("jsLogging",true);
        
    }    
}


var keysim =  {

	keyCode: {
		BACKSPACE: 8,
		COMMA: 188,
		DELETE: 46,
		DOWN: 40,
		END: 35,
		ENTER: 13,
		ESCAPE: 27,
		HOME: 36,
		LEFT: 37,
		NUMPAD_ADD: 107,
		NUMPAD_DECIMAL: 110,
		NUMPAD_DIVIDE: 111,
		NUMPAD_ENTER: 108,
		NUMPAD_MULTIPLY: 106,
		NUMPAD_SUBTRACT: 109,
		PAGE_DOWN: 34,
		PAGE_UP: 33,
		PERIOD: 190,
		RIGHT: 39,
		SPACE: 32,
		TAB: 9,
		UP: 38
	},

	buttonCode: {
		LEFT: 0,
		MIDDLE: 1,
		RIGHT: 2
	}
};

// Do the splitbutton

$(function() {
     

    $( "#rerun" )
      .button()
      .click(function() {
        // alert( "Running the last action" );
      })
      .next()
        .button({
          text: false,
          icons: {
            primary: "ui-icon-triangle-1-s"
          }
        })
        .click(function() {
          var menu = $( this ).parent().next().show().position({
            my: "left top",
            at: "left bottom",
            of: this
          });
          $( document ).one( "click", function() {
            menu.hide();
          });
          return false;
        })
        .parent()
          .buttonset()
          .next()
            .hide()
            .menu();

	$( "#close_call").button().click(function() {

          // Do the refresh here
	  console.warn("Closing call...");
		
	  var elemID = incidentRequest == 'incident' ? 'incident' 
					    : incidentRequest == 'request' ? 'u_request' 
					      : incidentRequest == 'change' ? 'change_request' : '';
		
	  $("#"+elemID+"\\.u_next_step_displayed option:contains('Close or cancel task')")
		.attr('selected', 'selected')
		.trigger('onchange');
          
	  $("#"+elemID+"\\.u_next_step_displayed option:contains('Set to closed')")
		.attr('selected', 'selected')
		.trigger('onchange');		
		

	  console.warn("Pressing save...");
	  var saveObject = $("#sysverb_update_and_stay").get();
	  var that = saveObject[0];
	  return unsafeWindow.gsftSubmit(that);		

        });

	$( "#refresh").button().click(function() { 

		// Do the refresh here
		console.warn("Refreshing frame gsft_main");
		parent.frames['gsft_main'].location.reload();

	});
});
