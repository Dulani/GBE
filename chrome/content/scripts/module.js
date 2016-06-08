Components.utils.import("resource://gre/modules/XPCOMUtils.jsm");
Components.utils.import("resource://gre/modules/Services.jsm");
Components.utils.import("resource://gre/modules/FileUtils.jsm");

const Cc = Components.classes;
const Ci = Components.interfaces;
const Cr = Components.results;
const Cu = Components.utils;


EXPORTED_SYMBOLS = ['fGoogleBookmarksModule'];

// assuming we're running under Firefox
var appInfo = Components.classes["@mozilla.org/xre/app-info;1"]
    .getService(Components.interfaces.nsIXULAppInfo);
var versionChecker = Components.classes["@mozilla.org/xpcom/version-comparator;1"]
    .getService(Components.interfaces.nsIVersionComparator);

var _above29 = (versionChecker.compare(appInfo.version, "29") >= 0);
if (_above29)
{
	Cu.import("resource:///modules/CustomizableUI.jsm");
}

var fGoogleBookmarksModule = 
{
	// адрес для получения списка закладок
	'baseUrl' : "https://www.google.com/bookmarks/",
	// адрес для работы с отдельными закладками
	'baseUrl2' : "https://www.google.com/bookmarks/mark",
  // список всех закладок (полученный с сервера) в формате XML
  'm_ganswer' : null,
  // список всех меток (папок)
  'm_labelsArr' : null,
  // список всех закладок (обработанный)
  'm_bookmarkList' : null,
  // разделитель меток при сортировке
  'labelSep'	: "{!|!}",
  // признак необходимости обновления меню со списком закладок
  'needRefresh'	: true,
  // предыдущее значение адреса
  'oldURL': null,
  // значение поля smh:signature из m_ganswer
  'm_signature' : null,
  'm_time_signature' : null,
  // id текущего элемента списка меню закладок (для работы контекстного меню)
  'currentContextId' : "",
  // id текущего меню (для работы контекстного меню)
  'currentFolderId' : "",
  // предыдущее значение поиска при автодополнении меток
  'oldSearchValue' : "",

  'refreshInProgress' : false,
  // массив отфильтрованных закладок
  'tempFilterArray' : [],
  // предыдущее значение фильтра
  'oldFilterValue' : "",

  /* ------Свойства------*/
  // разделитель вложенных меток
  'nestedLabelSep' : '/',
  // флаг показа иконок для закладок
  'showFavicons' : true,
  // флаг переключения действия левого клика по закладке
  'reverseBkmrkLeftClick' : false,
  // тип сортировки 
  'sortType' : "name",
  // направление сортировки
  'sortOrder' : "asc",
  // флаг автоподстановки меток для новых закладок
  'suggestLabel' : true,
  // флаг включения автодополнения в адресной строке
  'enableGBautocomplite' : false,
	// режим без примечаний - формат получения закладок: rss or xml
	'enableNotes' : true,
	// переключатель использования кнопки на панели или пункта в главном меню
	'useMenuBar' : false,
	// включить добавление метки к закладкам без метки
	'enableLabelUnlabeled' : false,
	// добавляемая метка
	'labelUnlabeledName' : "Unlabeled",
	'prefs' : null,
	'showToolbarAddBtn' : false,
	'showToolbarQuickAddBtn' : false,
	'minMenuWidth' : 300,
	'maxMenuWidth' : 400,
	'enable10recentBookmark' :false,
	'enable10visitedBookmark' :false,

	'enableLabelHiding' : true,
	'showHiddenLabels' : false,
	'hiddenLabelsTitle' : "_hidden_",

	'showTagsInTooltip' : false,
	'enableFilterByUrl' : false,
	'enableCtrlD' : false,
	'enableQuickSearch' : false,

	'enableDnD' : false,

	'darkThemeIcon' : false,
	// возможность ограничить поиск по отдельной метке
	'enableLableFilter' : false,

 	/* --------------------*/

 	'defAutocompliteList' : "",
 	'timeOut' : 10000,

 	'windowsParams' : {},

 	'debugMode' : false,
 	'debugId' : 0,

 	'above29' : _above29,
 	'm_recent10bkmrk' : [],
 	'lastKey' : null,
 	'keyUpTime' : 0,



  // nsIWebProgressListener
  'QueryInterface': XPCOMUtils.generateQI(["nsIWebProgressListener", "nsISupportsWeakReference"]),

  'GBLTut_ConsoleService' : Components.classes['@mozilla.org/consoleservice;1'].getService(Components.interfaces.nsIConsoleService),
  'cookieManager' : Components.classes["@mozilla.org/cookiemanager;1"].getService(Components.interfaces.nsICookieManager),


	/**
   * Вывод отладочных сообщений в консоль
   * @param {string} s1
   * @param {string} s2
   */
  ErrorLog : function(s1, s2)
	{
		var str = "";
		for (var i = 0; i < arguments.length; i++)
		{
			str += arguments[i] + " ";
		}
		this.GBLTut_ConsoleService.logStringMessage(str);
	},

	DebugLog : function(message)
	{
		if(this.debugMode)
		{
			this.ErrorLog(''+this.debugId, message);
		}
	},

	  /**
   * проверяет залогинен пользователь в GB или нет
   * @return {bool}
   */
  checkLogin : function () {
  	this.DebugLog("checkLogin");
		var	iter = this.cookieManager.enumerator;
		var domainRegexp = new RegExp(this.googleDomains.join('|'));
		while (iter.hasMoreElements()) 
		{
			var cookie = iter.getNext();
			if (cookie instanceof Components.interfaces.nsICookie && domainRegexp.test(cookie.host) && cookie.name === "SID")
			{
				return true;	
			}

		}
		return false;
	},

	/**
	 * удаляет куки авторизации в гугл аке (при ошибке получения списка закладок, для повторного логина)
	 */
	removeSIDCookie : function()
	{
		this.DebugLog("removeSIDCookie");
		var	iter = this.cookieManager.enumerator;
		var domainRegexp = new RegExp(this.googleDomains.join('|'));
		while (iter.hasMoreElements()) 
		{
			var cookie = iter.getNext();
			if (cookie instanceof Components.interfaces.nsICookie && domainRegexp.test(cookie.host) && cookie.name === "SID")
			{
				if ((versionChecker.compare(appInfo.version, "37") >= 0))
				{
					this.cookieManager.remove(cookie.host, cookie.name, cookie.path, cookie.originAttributes, false);
				}
				else
				{
					this.cookieManager.remove(cookie.host, cookie.name, cookie.path, false);
				}
			}
		}
	},

	/**
	 * читает значение заданного свойства. при отсутствии задает значение по-умолчанию
	 * @param  {string} prefName     назавание свойсива
	 * @param  {long}		prefType     тип свойства
	 * @param  					prefDefValue значение по-умолчанию
	 */
	readPrefValue : function(prefName, prefType, prefDefValue)
	{
		this.DebugLog("readPrefValue");
		if (this.prefs.getPrefType(prefName) == prefType)
		{
			// this[prefName] = ((prefType == this.prefs.PREF_STRING) ? this.prefs.getCharPref(prefName) : this.prefs.getBoolPref(prefName));
			if (prefType == this.prefs.PREF_STRING)
			{
				this[prefName] = this.prefs.getCharPref(prefName);
			}
			if (prefType == this.prefs.PREF_BOOL)
			{
				this[prefName] = this.prefs.getBoolPref(prefName);
			}
			if (prefType == this.prefs.PREF_INT)
			{
				this[prefName] = this.prefs.getIntPref(prefName);
			}		
		}
		else
		{
			if (prefType == this.prefs.PREF_STRING)
			{
				this.prefs.setCharPref(prefName, prefDefValue);
				this[prefName] = prefDefValue;
			}
			if (prefType == this.prefs.PREF_BOOL)
			{
				this.prefs.setBoolPref(prefName, prefDefValue);
				this[prefName] = prefDefValue;
			}
			if (prefType == this.prefs.PREF_INT)
			{
				this.prefs.setIntPref(prefName, prefDefValue);
				this[prefName] = prefDefValue;
			}
		}		
	},


	/**
	 * читает значения свойств
	 */
	getPrefsValues : function() 
	{
		this.DebugLog("getPrefsValues");
		this.prefs = Components.classes["@mozilla.org/preferences-service;1"]
     .getService(Components.interfaces.nsIPrefService)
     .getBranch("extensions.fessGBE.");

    this.readPrefValue("nestedLabelSep", this.prefs.PREF_STRING, "/");
    this.readPrefValue("showFavicons", this.prefs.PREF_BOOL, true);
    this.readPrefValue("reverseBkmrkLeftClick", this.prefs.PREF_BOOL, false);
    this.readPrefValue("sortType", this.prefs.PREF_STRING, "name");
    this.readPrefValue("sortOrder", this.prefs.PREF_STRING, "asc");
    this.readPrefValue("suggestLabel", this.prefs.PREF_BOOL, false);
    this.readPrefValue("enableGBautocomplite", this.prefs.PREF_BOOL, false);
    this.readPrefValue("enableNotes", this.prefs.PREF_BOOL, false);
    this.readPrefValue("useMenuBar", this.prefs.PREF_BOOL, false);
    this.readPrefValue("enableLabelUnlabeled", this.prefs.PREF_BOOL, false);
    this.readPrefValue("labelUnlabeledName", this.prefs.PREF_STRING, "Unlabeled");
    this.readPrefValue("showToolbarAddBtn", this.prefs.PREF_BOOL, false);
    this.readPrefValue("showToolbarQuickAddBtn", this.prefs.PREF_BOOL, false);
    this.readPrefValue("minMenuWidth", this.prefs.PREF_INT, 300);
    this.readPrefValue("maxMenuWidth", this.prefs.PREF_INT, 400);

    this.readPrefValue("enable10recentBookmark", this.prefs.PREF_BOOL, false);
    this.readPrefValue("enable10visitedBookmark", this.prefs.PREF_BOOL, false);

    this.readPrefValue("enableLabelHiding", this.prefs.PREF_BOOL, true);
    this.readPrefValue("showHiddenLabels", this.prefs.PREF_BOOL, false);
    this.readPrefValue("hiddenLabelsTitle", this.prefs.PREF_STRING, "_hidden_");

    this.readPrefValue("showTagsInTooltip", this.prefs.PREF_BOOL, false);
    this.readPrefValue("enableFilterByUrl", this.prefs.PREF_BOOL, false);
    this.readPrefValue("enableCtrlD", this.prefs.PREF_BOOL, false);
    this.readPrefValue("enableQuickSearch", this.prefs.PREF_BOOL, false);

    this.readPrefValue("enableDnD", this.prefs.PREF_BOOL, false);
    
    this.readPrefValue("darkThemeIcon", this.prefs.PREF_BOOL, false);

    this.readPrefValue("enableLableFilter", this.prefs.PREF_BOOL, false);
    
    if (this.above29)
    {
    	this.readPrefValue("GBE_btnAddBookmarkPlace", this.prefs.PREF_STRING, CustomizableUI.AREA_NAVBAR);
    	this.readPrefValue("GBE_btnQuickAddBookmarkPlace", this.prefs.PREF_STRING, CustomizableUI.AREA_NAVBAR);
    	this.readPrefValue("GBE_toolbaritemPlace", this.prefs.PREF_STRING, CustomizableUI.AREA_NAVBAR);
    	this.readPrefValue("GBE_btnAddBookmarkPosition", this.prefs.PREF_INT, -1);
    	this.readPrefValue("GBE_btnQuickAddBookmarkPosition", this.prefs.PREF_INT, -1);
    	this.readPrefValue("GBE_toolbaritemPosition", this.prefs.PREF_INT, -1);
    }

	},

	/**
	 * поиск информации о закладке по коду (или адресу)
	 * @param  {object} - params информация о закладке
	 * @param  {bool} findByURL = false - признак поиска по адресу
	 */
	getBookmark : function(params, findByURL = false)
	{
		this.DebugLog("getBookmark");
		try
		{
	  	// по-умолчанию ищем по коду
	  	let field = "id", value = params.id;
	  	// если установлен флаг - то по адресу
	  	if (findByURL)
	  	{
	  		field = "url";
	  		value = params.url;
	  	}
	  	if ((this.m_bookmarkList !== null) && (this.m_bookmarkList.length))
	  	{
		  	let m_bookmarkListLength = this.m_bookmarkList.length;
		  	// перебираем закладки
		  	for (let i = 0 ; i < m_bookmarkListLength; i++)
		  	{
		  		// если нашли заполняем поля и выходим
		  		if (this.m_bookmarkList[i][field] === value)
		  		{
		  			params.name = this.m_bookmarkList[i].title;
		  			params.id = this.m_bookmarkList[i].id;
		  			params.url = this.m_bookmarkList[i].url;
		  			params.labels = this.m_bookmarkList[i].labels;
		  			params.notes = this.m_bookmarkList[i].notes;
		  			if ('timestamp' in params) params.timestamp = this.m_bookmarkList[i].timestamp;
		  			// params.timestamp = this.m_bookmarkList[i].timestamp;
		  			params.index = i;
		  			return;
		  		}
		  	}
	  	}
	  	// не нашли - в поле id устанавливаем null 
	  	params.id = null;
		}
	  catch (e)
		{
			this.ErrorLog("GBE:getBookmark", " " + e + '(line = ' + e.lineNumber + ", col = " + e.columnNumber + ", file = " +  e.fileName);
		}
	},

getHwindow : function()
{
	return Cc["@mozilla.org/appshell/appShellService;1"].getService(Ci.nsIAppShellService).hiddenDOMWindow;
},

checkSignature : function()
{
	if (this.m_signature == null) return false;
	if ((new Date() - this.m_time_signature) > 3600000) return false;
	return true;
},


/**
 * получает сигнатуру для дальнейшей работы с закладками
 */
doRequestSignature : function(asyncMode = true)
{
	try
	{
		this.DebugLog("doRequestSignature");
		this.m_signature = null;
		let self = this;

// self.m_signature = "signaturetextContent";
// self.m_time_signature = new Date();
// return ;      		
		let hwindow = this.getHwindow();
		let request = Cc["@mozilla.org/xmlextras/xmlhttprequest;1"].createInstance(Ci.nsIXMLHttpRequest);
		// let data = 	"?output=rss&num=1";
		// request.open("GET", this.baseUrl + "lookup" + data, asyncMode);
		let data = 	"?zx="+((new Date()).getTime()) + "&output=rss&q=qB89f6ZAUXXsfrwPdN4t";
		request.open("GET", this.baseUrl + "find" + data, asyncMode);
		request.setRequestHeader("Content-Type", "application/x-www-form-urlencoded");
		request.setRequestHeader('User-Agent', "Mozilla/5.0 (Windows NT 6.1; rv:26.0) Gecko/20100101 Firefox/26.0");
		request.setRequestHeader('Accept','	text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8');
		let timeout = hwindow.setTimeout( 
			function(){ 
				request.abort(); 
				self.ErrorLog("GBE:doRequestSignature", " Error: Time over - while requesting signature");
				self.ErrorLog(request.responseText); //TODO: надо будет закоментировать
			}, 
			this.timeOut
		);
		request.onreadystatechange = function()
		{
	  	if (request.readyState != 4) return;
	  	hwindow.clearTimeout(timeout) // очистить таймаут при наступлении readyState 4
  		if (request.status == 200) 
  		{
/*      	if (request.responseXML.getElementsByTagName("smh:signature").length)
      	{
      		self.m_signature = request.responseXML.getElementsByTagName("smh:signature")[0].childNodes[0].nodeValue;
      		self.m_time_signature = new Date();
      		//self.ErrorLog("onreadystatechange", request.status);
      	}*/
      	var nsResolver = request.responseXML.createNSResolver(request.responseXML.documentElement);
      	var signatureIterator = request.responseXML.evaluate(
      		'//smh:signature', request.responseXML, nsResolver, 0, null );
      	var signature = signatureIterator.iterateNext();
      	if (signature)
      	{
      		self.m_signature = signature.textContent;
      		self.m_time_signature = new Date();
      	}
  		} 
  		else
  		{
				self.ErrorLog("GBE:doRequestSignature", " Error while requesting signature - edit bookmarks will not work.");
  		}
  	}
		request.send(null);
	}
	catch (e)
	{
		this.ErrorLog("GBE:doRequestSignature", " " + e + '(line = ' + e.lineNumber + ", col = " + e.columnNumber + ", file = " +  e.fileName);
	}
},

/**
 * получает примечание закладки
 * @param  id       id закладки
 * @param  name     название закладки (параметр для поиска)
 * @param  noteCtrl текстовое поле для редактирования примечания (в окне редактирования закладки)
 */
doRequestBookmarkNote : function(id, name, noteCtrl)
{
	try
	{
		this.DebugLog("doRequestBookmarkNote");
		let self = this;
		let hwindow = this.getHwindow();
		let request = Cc["@mozilla.org/xmlextras/xmlhttprequest;1"].createInstance(Ci.nsIXMLHttpRequest);
		let data = 	"?zx="+((new Date()).getTime()) + "&output=rss&q=" + '"' + encodeURIComponent(name) + '"';
		request.open("GET", this.baseUrl + "find" + data, true);
		request.setRequestHeader("Content-Type", "application/x-www-form-urlencoded");
		request.setRequestHeader('User-Agent', "Mozilla/5.0 (Windows NT 6.1; rv:26.0) Gecko/20100101 Firefox/26.0");
		request.setRequestHeader('Accept','	text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8');
		request.onreadystatechange = function()
		{
	  	if (request.readyState != 4) return;
	  	hwindow.clearTimeout(timeout) // очистить таймаут при наступлении readyState 4
  		if (request.status == 200) 
  		{
  			var bookmarks = request.responseXML.getElementsByTagName("item");
  			if (bookmarks.length)
  			{
  				for (var i = 0; i < bookmarks.length; i++)
  				{
  					let bookmark = self.xmlToJson(bookmarks[i]);
  					if (id == bookmark["smh:bkmk_id"]["#text"])
  						if (bookmark.hasOwnProperty("smh:bkmk_annotation"))
  						{
  							noteCtrl.value = bookmark["smh:bkmk_annotation"]["#text"];
  							return;
  						}

  					// if (id == bookmarks[i].getElementsByTagName("smh:bkmk_id")[0].childNodes[0].nodeValue)
  					// {
  					// 	if (bookmarks[i].getElementsByTagName("smh:bkmk_annotation").length)
  					// 	{
  					// 		noteCtrl.value = bookmarks[i].getElementsByTagName("smh:bkmk_annotation")[0].childNodes[0].nodeValue;
  					// 		return;
  					// 	}
  					// }
  				}
  			}
  		} 
  	}
		request.send(null);
		let timeout = hwindow.setTimeout( 
			function(){ 
				request.abort(); 
				self.ErrorLog("GBE:doRequestBookmarkNote", " Error: Time over - while requesting bookmark notes");
			}, 
			this.timeOut
		);
	}
	catch (e)
	{
		this.ErrorLog("GBE:doRequestBookmarkNote", "Obtain bookmark note (", name, ") - error!");
		this.ErrorLog("GBE:doRequestBookmarkNote", e + '(line = ' + e.lineNumber + ", col = " + e.columnNumber + ", file = " +  e.fileName);
	}
},

doRequestBookmarkURL : function (id, name, index, GBE_menupopup = null, asyncMode = false)
{
	try
	{
		this.DebugLog("doRequestBookmarkURL");
		let urlReturn = "";
		let self = this;
		let request = Cc["@mozilla.org/xmlextras/xmlhttprequest;1"].createInstance(Ci.nsIXMLHttpRequest);
		let data = 	"?zx="+((new Date()).getTime()) + "&output=xml&q=" + '"' + encodeURIComponent(name) + '"';
		request.open("GET", this.baseUrl + "find" + data, asyncMode);
		request.setRequestHeader("Content-Type", "application/x-www-form-urlencoded");
		request.setRequestHeader('User-Agent', "Mozilla/5.0 (Windows NT 6.1; rv:26.0) Gecko/20100101 Firefox/26.0");
		request.setRequestHeader('Accept','	text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8');
		
		request.onreadystatechange = function()
		{
	  	if (request.readyState != 4) return;
  		if (request.status == 200) 
  		{
  			let ids = request.responseXML.getElementsByTagName("id");
				let urls = request.responseXML.getElementsByTagName("url");
				if (ids.length && urls.length)
				{
					for (let i = 0; i < ids.length; i++)
					{
						if (id == ids[i].childNodes[0].nodeValue)
						{
							urlReturn = urls[i].childNodes[0].nodeValue;
							self.m_bookmarkList[index].url = urlReturn;
							if (GBE_menupopup !== null)
							{
								GBE_menupopup.getElementsByAttribute('id', id)[0].setAttribute("url", urlReturn);
							}
							self.ErrorLog("Obtained URL for ", name, "is", urlReturn);
							return urlReturn;
						}
					}
				}
  		} 
  	}
		request.send(null);
		return urlReturn;
	}
	catch (e)
	{
		this.ErrorLog("GBE:doRequestBookmarkURL", "Obtain bookmark URL (", name, ") - error!");
		this.ErrorLog("GBE:doRequestBookmarkURL", e + '(line = ' + e.lineNumber + ", col = " + e.columnNumber + ", file = " +  e.fileName);
	}
},

doDeleteFolder : function(label, signature)
{
	try
	{
		this.DebugLog("doDeleteFolder");
		if (!this.checkSignature())
		{
			this.doRequestSignature(false);
		}
		let self = this;
		let hwindow = this.getHwindow();
		let request = Cc["@mozilla.org/xmlextras/xmlhttprequest;1"].createInstance(Ci.nsIXMLHttpRequest);
		let data = 	"?op=modlabel&zx="+((new Date()).getTime()) + "&labels=" + 
								encodeURIComponent(label) + "&sig=" + (signature ? signature : this.m_signature);
		request.open("GET", this.baseUrl2 + data, true);
		request.setRequestHeader("Content-Type", "application/x-www-form-urlencoded");
		request.setRequestHeader('User-Agent', "Mozilla/5.0 (Windows NT 6.1; rv:26.0) Gecko/20100101 Firefox/26.0");
		request.setRequestHeader('Accept','	text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8');
		request.onreadystatechange = function()
		{
	  	if (request.readyState != 4) return;
	  	hwindow.clearTimeout(timeout) // очистить таймаут при наступлении readyState 4
  		if (request.status == 200) 
  		{
				self.needRefresh = true;  
  		} 
  		else 
  		{
        self.ErrorLog("GBE:doDeleteFolder", " An error occurred while deleting label (" + label + ").");
  		}
  	}
		request.send(null);
		this.windowsParams = {};
		let timeout = hwindow.setTimeout( 
			function(){ 
				request.abort(); 
				self.ErrorLog("GBE:doDeleteFolder", " Error: Time over - while deleting label (" + label + ").");
			}, 
			this.timeOut
		);
	}
	catch (e)
	{
		this.ErrorLog("GBE:doDeleteFolder", " " + e + '(line = ' + e.lineNumber + ", col = " + e.columnNumber + ", file = " +  e.fileName);
	}
},

doChangeFolder : function(oldLabel, label, signature)
{
	try
	{
		this.DebugLog("doChangeFolder");
		if (!this.checkSignature())
		{
			this.doRequestSignature(false);
		}
		let self = this;
		let hwindow = this.getHwindow();
		let request = Cc["@mozilla.org/xmlextras/xmlhttprequest;1"].createInstance(Ci.nsIXMLHttpRequest);
		request.open("POST", this.baseUrl2, true);
		request.setRequestHeader("Content-Type", "application/x-www-form-urlencoded");
		request.setRequestHeader('User-Agent', "Mozilla/5.0 (Windows NT 6.1; rv:26.0) Gecko/20100101 Firefox/26.0");
		request.setRequestHeader('Accept','	text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8');
		let data = 	"op=modlabel&zx="+((new Date()).getTime() + Math.random() * (99) + 1) + "&labels=" + 
								encodeURIComponent(oldLabel + "," + label) + "&sig=" + (signature ? signature : this.m_signature);
		request.onreadystatechange = function()
		{
	  	if (request.readyState != 4) return;
	  	hwindow.clearTimeout(timeout) // очистить таймаут при наступлении readyState 4
  		if (request.status == 200) 
  		{
				self.needRefresh = true;  
  		} 
  		else 
  		{
        self.ErrorLog("GBE:doChangeFolder", " An error occurred while renaming label (" + 	oldLabel + " to " + label + ").");
  		}
  	}
		request.send(data);
		this.windowsParams = {};	
		let timeout = hwindow.setTimeout( 
			function(){ 
				request.abort(); 
				self.ErrorLog("GBE:doChangeFolder", " Error: Time over - while renaming label (" + 	oldLabel + " to " + label + ").");
			}, 
			this.timeOut
		);
	}
  catch (e)
	{
		this.ErrorLog("GBE:doChangeFolder", " " + e + '(line = ' + e.lineNumber + ", col = " + e.columnNumber + ", file = " +  e.fileName);
	}
},

doChangeBookmark : function(params, overlay = null)
{
	try
	{
		this.DebugLog("doChangeBookmark");
		if (!this.checkSignature())
		{
			this.doRequestSignature(false);
		}
		let self = this;
		let hwindow = this.getHwindow();
		let request = Cc["@mozilla.org/xmlextras/xmlhttprequest;1"].createInstance(Ci.nsIXMLHttpRequest);
		request.open("POST", this.baseUrl2, true);
		request.setRequestHeader("Content-Type", "application/x-www-form-urlencoded");
		request.setRequestHeader('User-Agent', "Mozilla/5.0 (Windows NT 6.1; rv:26.0) Gecko/20100101 Firefox/26.0");
		request.setRequestHeader('Accept','	text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8');
		request.setRequestHeader('Connection', "keep-alive");
		// let data = 	"zx="+((new Date()).getTime()) + "&bkmk=" + encodeURIComponent(params.url) + 
		// 						"&title=" + encodeURIComponent(params.name) + "&labels=" + encodeURIComponent(params.labels) +
		// 						"&annotation=" + encodeURIComponent(params.notes) + "&prev=%2Flookup&sig=" + params.sig;
		let data = 	"zx="+((new Date()).getTime()) + "&bkmk=" + encodeURIComponent(params.url) + 
								"&title=" + encodeURIComponent(params.name) + "&labels=" + encodeURIComponent(params.labels) +
								"&annotation=" + encodeURIComponent(params.notes) + "&prev=%2Flookup&sig=" + 
								(params.sig ? params.sig : this.m_signature) + 	"&cd=bkmk&q=&start=0";

		request.onreadystatechange = function()
		{
	  	if (request.readyState != 4) return;
	  	hwindow.clearTimeout(timeout) // очистить таймаут при наступлении readyState 4
  		if (request.status == 200) 
  		{
  			if (params.oldUrl && params.oldUrl != params.url)
  			{
  				self.ErrorLog("Changing bookmarks URL from ", params.oldUrl, "to", params.url);
  				self.doDeleteBookmark({"url" : params.oldUrl, "id" : params.id, "sig" : params.sig}, overlay);
  			}

				self.needRefresh = true;  
				if (overlay !== null) overlay.changeButtonIcon(params.url, params.id, false); 
  		} 
  		else 
  		{
        self.ErrorLog("GBE:doChangeBookmark", " An error occurred while saving bookmark (" + params.url + ").");
  		}
  		self.windowsParams = {};
  	}

		request.send(data);

		let timeout = hwindow.setTimeout( 
			function(){ 
				request.abort(); 
				self.ErrorLog("GBE:doChangeBookmark", " Error: Time over - while saving bookmark (" + params.url + ").");
			}, 
			this.timeOut
		);
	}
  catch (e)
	{
		this.windowsParams = {};
		this.ErrorLog("GBE:doChangeBookmark", " " + e + '(line = ' + e.lineNumber + ", col = " + e.columnNumber + ", file = " +  e.fileName);
	}
},

doDeleteBookmark : function(params, overlay = null)
{
	try
	{
		this.DebugLog("doDeleteBookmark");
		if (!this.checkSignature())
		{
			this.doRequestSignature(false);
		}
		let self = this;
		let hwindow = this.getHwindow();
		let request = Cc["@mozilla.org/xmlextras/xmlhttprequest;1"].createInstance(Ci.nsIXMLHttpRequest);
		let data = 	"?zx="+((new Date()).getTime()) + "&dlq=" + params.id + "&sig=" + (params.sig ? params.sig : this.m_signature);
		request.open("GET", this.baseUrl2 + data, true);
		request.setRequestHeader("Content-Type", "application/x-www-form-urlencoded");
		request.setRequestHeader('User-Agent', "Mozilla/5.0 (Windows NT 6.1; rv:26.0) Gecko/20100101 Firefox/26.0");
		request.setRequestHeader('Accept','	text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8');
		request.onreadystatechange = function()
		{
	  	if (request.readyState != 4) return;
	  	hwindow.clearTimeout(timeout) // очистить таймаут при наступлении readyState 4
  		if (request.status == 200) 
  		{
				self.needRefresh = true;  
				if (overlay !== null) overlay.changeButtonIcon(params.url, params.id); 
  		} 
  		else 
  		{
        self.ErrorLog("GBE:doDeleteBookmark", " An error occurred while deleting bookmark (" + params.url + ").");
  		}
  	}
		request.send(null);
		this.windowsParams = {};
		let timeout = hwindow.setTimeout( 
			function(){ 
				request.abort(); 
				self.ErrorLog("GBE:doDeleteBookmark", " Error: Time over - while deleting bookmark (" + params.url + ").");
			}, 
			this.timeOut
		);
	}
  catch (e)
	{
		this.windowsParams = {};
		this.ErrorLog("GBE:doDeleteBookmark", " " + e + '(line = ' + e.lineNumber + ", col = " + e.columnNumber + ", file = " +  e.fileName);
	}
},

// Changes XML to JSON
xmlToJson : function(xml) {
	
	// Create the return object
	var obj = {};

	if (xml.nodeType == 1) { // element
		// do attributes
		if (xml.attributes.length > 0) {
		obj["@attributes"] = {};
			for (var j = 0; j < xml.attributes.length; j++) {
				var attribute = xml.attributes.item(j);
				obj["@attributes"][attribute.nodeName] = attribute.value;
			}
		}
	} else if (xml.nodeType == 3) { // text
		obj = xml.nodeValue;
	}

	// do children
	if (xml.hasChildNodes()) {
		for(var i = 0; i < xml.childNodes.length; i++) {
			var item = xml.childNodes.item(i);
			var nodeName = item.nodeName;
			if (typeof(obj[nodeName]) == "undefined") {
				obj[nodeName] = this.xmlToJson(item);
			} else {
				if (typeof(obj[nodeName].push) == "undefined") {
					var old = obj[nodeName];
					obj[nodeName] = [];
					obj[nodeName].push(old);
				}
				obj[nodeName].push(this.xmlToJson(item));
			}
		}
	}
	return obj;
},

	FileManager : {
		Write:
	    function (File, Text, withBOM = false)
	    {
        if (!File) return;
        const unicodeConverter = Components.classes["@mozilla.org/intl/scriptableunicodeconverter"]
            .createInstance(Components.interfaces.nsIScriptableUnicodeConverter);

        unicodeConverter.charset = "UTF-8";
        if (!withBOM)
        	Text = unicodeConverter.ConvertFromUnicode(Text);
        else
        	Text = "\xEF\xBB\xBF" + unicodeConverter.ConvertFromUnicode(Text);
        const os = Components.classes["@mozilla.org/network/file-output-stream;1"]
          .createInstance(Components.interfaces.nsIFileOutputStream);
        os.init(File, 0x02 | 0x08 | 0x20, 0700, 0);
        os.write(Text, Text.length);
        os.close();
	    },

		Read:
	    function (File)
	    {
        if (!File) return;
        let res;

        const is = Components.classes["@mozilla.org/network/file-input-stream;1"]
            .createInstance(Components.interfaces.nsIFileInputStream);
        const sis = Components.classes["@mozilla.org/scriptableinputstream;1"]
            .createInstance(Components.interfaces.nsIScriptableInputStream);
        is.init(File, 0x01, 0400, null);
        sis.init(is);

        res = sis.read(sis.available());

        let utf8Converter = Components.classes["@mozilla.org/intl/utf8converterservice;1"].
            getService(Components.interfaces.nsIUTF8ConverterService);
        let data = utf8Converter.convertURISpecToUTF8 (res, "UTF-8"); 

        is.close();

        return data;
	    },
	},


	"googleDomains" : ["google.ad", "google.ae", "google.al", "google.am", "google.as", "google.at", "google.az", "google.ba", "google.be", "google.bf", "google.bg", "google.bi", "google.bj", "google.bs", "google.bt", "google.by", "google.ca", "google.cat", "google.cd", "google.cf", "google.cg", "google.ch", "google.ci", "google.cl", "google.cm", "google.cn", "google.co.ao", "google.co.bw", "google.co.ck", "google.co.cr", "google.co.id", "google.co.il", "google.co.in", "google.co.jp", "google.co.ke", "google.co.kr", "google.co.ls", "google.co.ma", "google.co.mz", "google.co.nz", "google.co.th", "google.co.tz", "google.co.ug", "google.co.uk", "google.co.uz", "google.co.ve", "google.co.vi", "google.co.za", "google.co.zm", "google.co.zw", "google.com", "google.cv", "google.cz", "google.de", "google.dj", "google.dk", "google.dm", "google.dz", "google.ee", "google.es", "google.fi", "google.fm", "google.fr", "google.ga", "google.ge", "google.gg", "google.gl", "google.gm", "google.gp", "google.gr", "google.gy", "google.hn", "google.hr", "google.ht", "google.hu", "google.ie", "google.im", "google.iq", "google.is", "google.it", "google.je", "google.jo", "google.kg", "google.ki", "google.kz", "google.la", "google.li", "google.lk", "google.lt", "google.lu", "google.lv", "google.md", "google.me", "google.mg", "google.mk", "google.ml", "google.mn", "google.ms", "google.mu", "google.mv", "google.mw", "google.ne", "google.nl", "google.no", "google.nr", "google.nu", "google.pl", "google.pn", "google.ps", "google.pt", "google.ro", "google.rs", "google.ru", "google.rw", "google.sc", "google.se", "google.sh", "google.si", "google.sk", "google.sm", "google.sn", "google.so", "google.st", "google.td", "google.tg", "google.tk", "google.tl", "google.tm", "google.tn", "google.to", "google.tt", "google.vg", "google.vu", "google.ws"]
};