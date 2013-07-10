/* 
Version 0.1.2
добавлена jQuery для ajax запросов (через XMLHttpRequest перестало работать редактирование закладок)

Version 0.1.1
Дурацкие правила мозилы

Version 0.1.0 
! при неудаче получения списка закладок с серевера (ошибка или куки был, а на самом деле логина не было) теперь удаляется куки SID

Version 0.0.9
! javascript namespace changed from GBE to fGoogleBookmarksExtension

Version 0.0.8
! кнопка добавлялась только на панель навигации - исправлено

Version 0.0.7
+ добавлено контекстное меню для меток (редактирование, удаление, открытие вложенных закладок, добавление закладки с выбранной меткой)

Version 0.0.6
+добавлено автодополнение меток в диалоге редактирования закладки

Version 0.0.5
+ добавлена работа с закладками через контекстное меню (открытие в той же вкладке, редактирование, удаление)

Version 0.0.4
+ удаление закладок

Version 0.0.3
+ редактирование закладок

Version 0.0.2
+ формирование меню закладок

Version 0.0.1
+ появилась кнопка на панели :)
*/
Components.utils.import("resource://gre/modules/XPCOMUtils.jsm");
var fGoogleBookmarksExtension = 
{
	// адрес для получения списка закладок
	'baseUrl' : "https://www.google.com/bookmarks/",
	// адрес для работы с отдельными закладками
	'baseUrl2' : "https://www.google.com/bookmarks/mark",
	// для вывода отладочной информации (ошибок) в консоль
	'GBLTut_ConsoleService' :
      Components.
          classes['@mozilla.org/consoleservice;1'].
              getService(Components.interfaces.nsIConsoleService),
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
  'm_signature' : "",
  // id текущего элемента списка меню закладок (для работы контекстного меню)
  'currentContextId' : "",
  // id текущего меню (для работы контекстного меню)
  'currentFolderId' : "",
  // предыдущее значение поиска при автодополнении меток
  'oldSearchValue' : "",

  'refreshInProgress' : false,

  'nestedLabelSep' : '/',

  // nsIWebProgressListener
  'QueryInterface': XPCOMUtils.generateQI(["nsIWebProgressListener", "nsISupportsWeakReference"]),

  onLocationChange: function(aProgress, aRequest, aURI) 
  {
    this.processNewURL(aURI);
  },

  init: function()
	{
		this.nestedLabelSep = this.getNestedLabelSep();
		if (window.location == "chrome://browser/content/browser.xul")
		{
			 Components.classes["@mozilla.org/moz/jssubscript-loader;1"].getService(
				 Components.interfaces.mozIJSSubScriptLoader).loadSubScript("chrome://GBE/content/scripts/jquery.min.js"); 
			if(this.needRefresh && this.checkLogin() && document.getElementById("GBE-toolbarbutton") )
			{
				 this.refreshBookmarks(false);
			}
			gBrowser.addProgressListener(this);

		}
		// Components.classes["@mozilla.org/moz/jssubscript-loader;1"].getService(Components.interfaces.mozIJSSubScriptLoader).loadSubScript("chrome://GBE/content/scripts/jquery.min.js"); 

		//copy the jQuery variable into our namespace
		//var $ = window.$;

		//then restore the global $ and jQuery objects
		//jQuery.noConflict(true);
	},

	uninit: function()
	{
		if (window.location == "chrome://browser/content/browser.xul")
		{
			gBrowser.removeProgressListener(this);
		}
	},

	/**
	 * меняет иконку на панели и активность кнопок в меню
	 * @param id - код закладки или null
	 */
	setButtonIcons: function(id)
	{
		try
		{
			if (document.getElementById("GBE-toolbarbutton"))
			{
				if (id)
				{
					document.getElementById("GBE-toolbarbutton").setAttribute("image", "chrome://GBE/skin/images/Star_full.png");
					document.getElementById("GBE-hmenuAdd").setAttribute("image", "chrome://GBE/skin/images/bkmrk_add_off.png");
					document.getElementById("GBE-hmenuAdd").setAttribute("disabled", "true");
					document.getElementById("GBE-hmenuEdit").setAttribute("image", "chrome://GBE/skin/images/bkmrk_edit_on.png");
					document.getElementById("GBE-hmenuEdit").setAttribute("disabled", "false");
					document.getElementById("GBE-hmenuDel").setAttribute("image", "chrome://GBE/skin/images/bkmrk_delete_on.png");
					document.getElementById("GBE-hmenuDel").setAttribute("disabled", "false");
				}
				else
				{
					document.getElementById("GBE-toolbarbutton").setAttribute("image", "chrome://GBE/skin/images/Star_empty.png");
					document.getElementById("GBE-hmenuAdd").setAttribute("image", "chrome://GBE/skin/images/bkmrk_add_on.png");
					document.getElementById("GBE-hmenuAdd").setAttribute("disabled", "false");
					document.getElementById("GBE-hmenuEdit").setAttribute("image", "chrome://GBE/skin/images/bkmrk_edit_off.png");
					document.getElementById("GBE-hmenuEdit").setAttribute("disabled", "true");
					document.getElementById("GBE-hmenuDel").setAttribute("image", "chrome://GBE/skin/images/bkmrk_delete_off.png");
					document.getElementById("GBE-hmenuDel").setAttribute("disabled", "true");
				}
			}
		}
	  catch (e)
		{
			this.ErrorLog("GBE:setButtonIcons", " " + e + '(line = ' + e.lineNumber + ", col = " + e.columnNumber + ", file = " +  e.fileName);
		}
	},

	/**
	 * обработчик изменения адреса
	 * @param aURI - текущий адрес
	 */
	processNewURL: function(aURI) 
	{
    try
    {
	    // адрес не поменялся - ничего не делаем
	    if (aURI.spec === this.oldURL) 
	  	{
	  		return;
	  	}
			var params = {name : "", id : null,	url : aURI.spec, labels : "", notes : ""};
			fGoogleBookmarksExtension.getBookmark(params, true);
			fGoogleBookmarksExtension.setButtonIcons(params.id);
	    fGoogleBookmarksExtension.oldURL = aURI.spec;
    }
	  catch (e)
		{
			this.ErrorLog("GBE:processNewURL", " " + e + '(line = ' + e.lineNumber + ", col = " + e.columnNumber + ", file = " +  e.fileName);
		}
   },

  /**
   * поиск информации о закладке по коду (или адресу)
   * @param  {object} - params информация о закладке
   * @param  {bool} findByURL = false - признак поиска по адресу
   */
  getBookmark : function(params, findByURL = false)
  {
  	try
  	{
	  	// по-умолчанию ищем по коду
	  	var number = 2, value = params.id;
	  	var i;
	  	// если установлен флаг - то по адресу
	  	if (findByURL)
	  	{
	  		number = 1;
	  		value = params.url;
	  	}
	  	if ((this.m_bookmarkList) && (this.m_bookmarkList.length))
	  	{
		  	// перебираем закладки
		  	for (i = 0; i < this.m_bookmarkList.length; i++)
		  	{
		  		// если нашли заполняем поля и выходим
		  		if (this.m_bookmarkList[i][number] === value)
		  		{
		  			params.name = this.m_bookmarkList[i][0];
		  			params.id = this.m_bookmarkList[i][2];
		  			params.url = this.m_bookmarkList[i][1];
		  			params.labels = this.m_bookmarkList[i][3];
		  			params.notes = this.m_bookmarkList[i][4];
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

  /**
   * проверяет залогинен пользователь в GB или нет
   * @return {bool}
   */
  checkLogin: function () {
		var cookieManager = Components.classes["@mozilla.org/cookiemanager;1"].getService(Components.interfaces.nsICookieManager),
				iter = cookieManager.enumerator;
		
		while (iter.hasMoreElements()) 
		{
			var cookie = iter.getNext();
			if (cookie instanceof Components.interfaces.nsICookie && cookie.host.indexOf("google.com") !== -1 && cookie.name === "SID")
			{
				return true;	
			}
		}
		return false;
	},

	/**
	 * удаляет куки авторизации в гугл аке (при ошибке получения списка закладок, для повторного логина)
	 */
	removeSIDCookie: function()
	{
		var cookieManager = Components.classes["@mozilla.org/cookiemanager;1"].getService(Components.interfaces.nsICookieManager),
				iter = cookieManager.enumerator;
		while (iter.hasMoreElements()) 
		{
			var cookie = iter.getNext();
			if (cookie instanceof Components.interfaces.nsICookie && cookie.host.indexOf("google.com") !== -1 && cookie.name === "SID")
			{
				cookieManager.remove(cookie.host, cookie.name, cookie.path, false);
				return;	
			}
		}
	},

	/**
	 * получает список закладок с сервера в формате RSS
	 * @param  {bool} showMenu - показывать меню после обновления или нет
	 */
	doRequestBookmarks: function(showMenu)
	{
		try
		{
			this.m_ganswer = null;
			this.m_signature = null;
			this.m_bookmarkList = null;
			this.m_labelsArr = null;
			var xhr = new XMLHttpRequest();
			xhr.open("GET", this.baseUrl + "lookup?output=rss&num=10000", true); 
			//TODO: может переделать на onreadystatechange ?
			xhr.onload = function() {
				if (this.responseXML)
				{
		    	fGoogleBookmarksExtension.m_ganswer = this.responseXML.documentElement;
		    	fGoogleBookmarksExtension.doBuildMenu();
		    	if (showMenu)
		    	{
		    		document.getElementById("GBE-popup").openPopup(document.getElementById("GBE-toolbarbutton"), "after_start",0,0,false,false);
		    	}
	    	}
	    	else
	    	{
	    		fGoogleBookmarksExtension.removeSIDCookie();
	    		fGoogleBookmarksExtension.refreshInProgress = false;
	    		fGoogleBookmarksExtension.ErrorLog("doRequestBookmarks", "Ошибка при получении списка закладок");
	    	}
	  	};
	  	xhr.onerror = function() {
	  		fGoogleBookmarksExtension.removeSIDCookie();
	  		fGoogleBookmarksExtension.refreshInProgress = false;
	    	fGoogleBookmarksExtension.ErrorLog("doRequestBookmarks", "Ошибка при получении списка закладок");
	  	};
	  	xhr.send(null);
	  }
	  catch (e)
		{
			this.ErrorLog("GBE:doRequestBookmarks", " " + e + '(line = ' + e.lineNumber + ", col = " + e.columnNumber + ", file = " +  e.fileName);
		}
	},


	doRequestBookmarksJQuery: function(showMenu)
	{
		try
		{
			this.m_ganswer = null;
			this.m_signature = null;
			this.m_bookmarkList = null;
			this.m_labelsArr = null;

			jQuery.noConflict();
			jQuery.ajax({
	      type: "GET",
	      url: this.baseUrl + "lookup",
	      data: 
	      	{
	          output: "rss",
	          num: 10000
	        },
	      dataType : "XML",
	      timeout: 5000,
	      error: function(XMLHttpRequest, textStatus, errorThrown) {
	      	GoogleBookmarksExtension.removeSIDCookie();
	  			fGoogleBookmarksExtension.refreshInProgress = false;
	    		fGoogleBookmarksExtension.ErrorLog("doRequestBookmarksJQuery", "Ошибка при получении списка закладок");
	      },
	      success: function(responseXML, textStatus) {
					if (responseXML)
					{
			    	fGoogleBookmarksExtension.m_ganswer = responseXML.documentElement;
			    	fGoogleBookmarksExtension.doBuildMenu();
			    	if (showMenu)
			    	{
			    		document.getElementById("GBE-popup").openPopup(document.getElementById("GBE-toolbarbutton"), "after_start",0,0,false,false);
			    	}
		    	}
		    	else
		    	{
		    		fGoogleBookmarksExtension.removeSIDCookie();
		    		fGoogleBookmarksExtension.refreshInProgress = false;
		    		fGoogleBookmarksExtension.ErrorLog("doRequestBookmarksJQuery", "Ошибка при получении списка закладок!");
		    	}
	      }
	    });
	  }
	  catch (e)
		{
			this.ErrorLog("GBE:doRequestBookmarksJQuery", " " + e + '(line = ' + e.lineNumber + ", col = " + e.columnNumber + ", file = " +  e.fileName);
		}
	},

	/**
	 * удаляет все закладки из меню
	 */
	doClearBookmarkList: function()
	{
		var GBE_GBlist = document.getElementById("GBE-GBlist");
		try
		{
			while (GBE_GBlist.hasChildNodes())
			{
				var firstChild = GBE_GBlist.firstElementChild;
				GBE_GBlist.removeChild(firstChild);
			}
		}
		catch (e)
		{
			this.ErrorLog("GBE:doClearBookmarkList", " " + e + '(line = ' + e.lineNumber + ", col = " + e.columnNumber + ", file = " +  e.fileName);
		}
	},

	/**
	 * формирует меню закладок
	 */
	doBuildMenu: function()
	{
		try
		{		
			// получаем все метки из XML ответа сервера
			var labels = this.m_ganswer.getElementsByTagName("smh:bkmk_label");
			// получаем все закладки из XML ответа сервера
			var bookmarks = this.m_ganswer.getElementsByTagName("item");
			// контейнер в меню, в который будут добавляться закладки
			var GBE_GBlist = document.getElementById("GBE-GBlist");
			var allLabelsStr, i;

			// сохраняем сигнатуру из ответа (необходима при работе с закладками)
			if (this.m_ganswer.getElementsByTagName("smh:signature").length)
			{
				this.m_signature = this.m_ganswer.getElementsByTagName("smh:signature")[0].childNodes[0].nodeValue;
			}
			
			// если закладок и меток в ответе сервера нет - ничего не делаем
			if (!labels.length && !bookmarks.length) 
			{
				this.refreshInProgress = false;
			 	return; 
			}

			// временная строка для группировки и сортировки меток
			allLabelsStr = this.labelSep;
			// группируем метки
			for (i = 0; i < labels.length; i++) 
			{
				// название метки
				var labelVal = labels[i].childNodes[0].nodeValue;
				// если такой метки во временной строке еще нет - добавляем ее (с разделителем)
				if (allLabelsStr.indexOf(this.labelSep + labelVal + this.labelSep) === -1)
				{
					allLabelsStr += (labelVal + this.labelSep);
				}
			}
			
			//this.ErrorLog("GBE:doBuildMenu", " " + allLabelsStr);
			// удаляем первый и последний разделитель ("|")
			if (allLabelsStr.length > 5)
			{
				allLabelsStr = allLabelsStr.substr(5, allLabelsStr.length-10);
			}
			
			//this.ErrorLog("GBE:doBuildMenu", " " + allLabelsStr);
			// получаем массив меток
			this.m_labelsArr = allLabelsStr.split(this.labelSep);
			if (this.m_labelsArr.length)
			{
				// сортируем массив меток
				this.m_labelsArr.sort(this.sortStrings);
				// добавляем метки в меню (в виде папок)
				for (i = 0; i < this.m_labelsArr.length; i++) 
				{
					var arr_nested_label = this.m_labelsArr[i].split(this.nestedLabelSep);
					if (arr_nested_label.length == 1)
					{
						// var tempMenu = document.createElement('menu');
						// this.appendLabelItem(GBE_GBlist, tempMenu, this.m_labelsArr[i], this.m_labelsArr[i]);
						this.appendLabelItem(GBE_GBlist, document.createElement('menu'), this.m_labelsArr[i], this.m_labelsArr[i]);
					}
					else
					{
						var fullName = arr_nested_label[0];
						var tempMenu = GBE_GBlist.getElementsByAttribute('id',"GBE_" + fullName)[0];
						if (tempMenu == null)
						{
							// var tempMenu = document.createElement('menu');
							// this.appendLabelItem(GBE_GBlist, tempMenu, fullName, fullName);
							this.appendLabelItem(GBE_GBlist, document.createElement('menu'), fullName, fullName);
						}
						
						for (var j = 1; j < arr_nested_label.length; j++)
						{
							var parentContainer = GBE_GBlist.getElementsByAttribute('id',"GBE_" + fullName)[0].childNodes[0];
							fullName += this.nestedLabelSep + arr_nested_label[j];
							var tempSubMenu = GBE_GBlist.getElementsByAttribute('id',"GBE_" + fullName)[0];
							if (tempSubMenu == null)
							{
								// this.appendLabelItem(parentContainer, tempSubMenu, fullName, arr_nested_label[j]);
								this.appendLabelItem(
									parentContainer, document.createElement('menu'), 
									fullName, arr_nested_label[j], fullName)
								;
							}							
						}
					}
				}
			}

			// список закладок
			this.m_bookmarkList = new Array(bookmarks.length);
			// сохраняем закладки в поле m_bookmarkList
			for (i = 0; i < bookmarks.length; i++) 
			{
				this.m_bookmarkList[i] = new Array(5);
				this.m_bookmarkList[i][0] = bookmarks[i].getElementsByTagName("title")[0].childNodes[0].nodeValue;
				this.m_bookmarkList[i][1] = bookmarks[i].getElementsByTagName("link")[0].childNodes[0].nodeValue;
				this.m_bookmarkList[i][2] = bookmarks[i].getElementsByTagName("smh:bkmk_id")[0].childNodes[0].nodeValue;
				var bookmark_labels = bookmarks[i].getElementsByTagName("smh:bkmk_label");
				var	j;
				// закладка с метками?
				if (bookmark_labels.length)
				{
					// сохраняем метки в массив
					this.m_bookmarkList[i][3] = new Array(bookmark_labels.length);
					for (j = 0; j < bookmark_labels.length; j++)
					{
						this.m_bookmarkList[i][3][j] =  bookmark_labels[j].childNodes[0].nodeValue;
					}
				}
				else
				{
					this.m_bookmarkList[i][3] = "";
				}
				// закладка с примечанием?
				if (bookmarks[i].getElementsByTagName("smh:bkmk_annotation").length)
				{
					this.m_bookmarkList[i][4] = bookmarks[i].getElementsByTagName("smh:bkmk_annotation")[0].childNodes[0].nodeValue;
				}
				else
				{
					this.m_bookmarkList[i][4] = "";
				}
			}
			// сортируем массив закладок
			this.m_bookmarkList.sort(this.sortStrings);

			// добавляем закладки в меню
			for (i = 0; i < this.m_bookmarkList.length; i++) 
			{
				var parentContainer,
						tempMenuitem;
				// если у закладки есть метки
				if (this.m_bookmarkList[i][3] !== "") 
				{
					// то добавляем ее во вложенное меню каждой метки
					for (j = 0; j < this.m_bookmarkList[i][3].length; j++)
					{
						tempMenuitem = document.createElement('menuitem');
						parentContainer = GBE_GBlist.getElementsByAttribute("id", "GBE_" + this.m_bookmarkList[i][3][j])[0].childNodes[0];
						this.appendMenuItem(parentContainer, tempMenuitem, this.m_bookmarkList[i]);
					}
				}
				else
				{
					// иначе - в основное меню
					tempMenuitem = document.createElement('menuitem');
					parentContainer = GBE_GBlist;
					this.appendMenuItem(parentContainer, tempMenuitem, this.m_bookmarkList[i]);
				}
			}
			this.needRefresh = false;
			this.refreshInProgress = false;
		}
		catch (e)
		{
			this.ErrorLog("GBE:doBuildMenu", " " + e + '(line = ' + e.lineNumber + ", col = " + e.columnNumber + ", file = " +  e.fileName);
		}
	},

	/**
	 * отправляет запрос на добавление (изменение) закладки
	 * @param  {object} params - параметры редактируемой закладки
	 */
	doChangeBookmark: function(params)
	{
		var xhr = new XMLHttpRequest();
		xhr.open("POST", this.baseUrl2, true); 
		// запрос отправлен удачно
		xhr.onload = function() 
		{
			//TODO: может переделать на onreadystatechange ?
			// необходимо обновить меню
			fGoogleBookmarksExtension.needRefresh = true;  
			if (window.content.location.href == params.url)
			{
				// меняем иконку на панели
				fGoogleBookmarksExtension.setButtonIcons(!params.id);
				// fGoogleBookmarksExtension.ErrorLog("GBE:onLoad", " " + this.statusText);
				// fGoogleBookmarksExtension.ErrorLog("GBE:onLoad", " " + this.responseText);
				// fGoogleBookmarksExtension.ErrorLog("GBE:onLoad", " " + this.getAllResponseHeaders());
			}
  	};
  	// ошибка при запросе
  	xhr.onerror = function() 
  	{
    	fGoogleBookmarksExtension.ErrorLog("GBE:doChangeBookmark", " An error occurred while saving bookmark (" + params.url + ").");
  	};
  	var curdate = new Date();
  	// var request = 'zx=' + (new Date()).getTime() + '&bkmk=' + escape(params.url) + '&title=' + encodeURIComponent(params.name) + 
  	// 					'&annotation=' + encodeURIComponent(params.notes) + '&labels=' + encodeURIComponent(params.labels) + 
  	// 					'&prev="/lookup"&sig=' + params.sig;
   	var request = 'q=&bkmk=' + encodeURIComponent(params.url) + 
   								'&prev=' + encodeURIComponent('/lookup') + 
   								'&start=0&cd=bkmk&sig=' + params.sig + 
   								'&day=' + curdate.getDate() + '&month=' + (curdate.getMonth()+1) + '&yr=' + curdate.getFullYear() +
   								'&title=' + encodeURIComponent(params.name) +
   								'&labels=' + encodeURIComponent(params.labels) +
   								'&annotation=' + encodeURIComponent(params.notes);

   	var request = 'bkmk=' + encodeURIComponent(params.url) + 
   								'&prev=' + encodeURIComponent('/lookup') + 
   								'&sig=' + params.sig + 
   								//'&day=' + curdate.getDate() + '&month=' + (curdate.getMonth()+1) + '&yr=' + curdate.getFullYear() +
   								'&title=' + encodeURIComponent(params.name) +
   								'&labels=' + encodeURIComponent(params.labels) +
   								'&annotation=' + encodeURIComponent(params.notes);
  	this.ErrorLog("GBE:doChangeBookmark", " " + this.baseUrl2 + " " + request);
  	xhr.send(request);
	},	



	doChangeBookmarkJQuery: function(params)
	{
		try
		{
			jQuery.noConflict();
			jQuery.ajax({
	      type: "post",
	      url: this.baseUrl2,
	      data: 
	      	{
	          zx: (new Date()).getTime(),
	          bkmk: params.url,
	          title: params.name,
	          labels: params.labels,
	          annotation: params.notes,
	          prev: "/lookup",
	          sig: params.sig
	        },
	      timeout: 5000,
	      error: function(XMLHttpRequest, textStatus, errorThrown) {
	        fGoogleBookmarksExtension.ErrorLog("GBE:doChangeBookmarkJQuery", " An error occurred while saving bookmark (" + params.url + ").");
	      },
	      success: function(data, textStatus) {
					fGoogleBookmarksExtension.needRefresh = true;  
					if (window.content.location.href == params.url)
					{
						// меняем иконку на панели
						fGoogleBookmarksExtension.setButtonIcons(!params.id);
	      	}
	      }
	    });
		}
	  catch (e)
		{
			this.ErrorLog("GBE:doChangeBookmarkJQuery", " " + e + '(line = ' + e.lineNumber + ", col = " + e.columnNumber + ", file = " +  e.fileName);
		}
	},	

	/**
	 * отправляет запрос на удаление закладки
	 * @param  {object} params параметры удаляемой закладки
	 */
	doDeleteBookmark: function(params)
	{
			var request = this.baseUrl2 + "?zx=" + (new Date()).getTime() + "&dlq=" + params.id + "&sig=" + params.sig;
			var xhr = new XMLHttpRequest();
			xhr.open("GET", request, true); 
			xhr.onload = function() 
			{
				//TODO: может переделать на onreadystatechange ?
				fGoogleBookmarksExtension.needRefresh = true; 
				if (window.content.location.href == params.url)
				{
					// меняем иконку на панели
					fGoogleBookmarksExtension.setButtonIcons(null);
					//document.getElementById("GBE-toolbarbutton").setAttribute("image", "chrome://GBE/skin/images/Star_empty.png");
				}
	  	};
	  	xhr.onerror = function() 
	  	{
	    	fGoogleBookmarksExtension.ErrorLog("GBE:doDeleteBookmark", " An error occurred while deleting bookmark (" + params.url + ").");
	  	};
	  	xhr.send(null);
	},

	doDeleteBookmarkJQuery: function(params)
	{
		try
		{
			jQuery.noConflict();
			jQuery.ajax({
				type: "get",
	      url: this.baseUrl2,
	      data: 
	      	{
	          zx: (new Date()).getTime(),
	          dlq: params.id,
	          sig: params.sig
	        },
	      timeout: 5000,
	      error: function(XMLHttpRequest, textStatus, errorThrown) {
	      	fGoogleBookmarksExtension.ErrorLog("GBE:doDeleteBookmarkJQuery", " An error occurred while deleting bookmark (" + params.url + ").");
	      },
	      success: function(data, textStatus) {
					fGoogleBookmarksExtension.needRefresh = true; 
					if (window.content.location.href == params.url)
					{
						// меняем иконку на панели
						fGoogleBookmarksExtension.setButtonIcons(null);
					}
	      }
			});
		}
	  catch (e)
		{
			this.ErrorLog("GBE:doDeleteBookmarkJQuery", " " + e + '(line = ' + e.lineNumber + ", col = " + e.columnNumber + ", file = " +  e.fileName);
		}
	},

	doChangeFolderJQuery: function(oldLabel, label, signature)
	{
		try
		{
			jQuery.noConflict();
			jQuery.ajax({
				type: "POST",
	      url: this.baseUrl2,
	      data: 
	      	{
	      		op: "modlabel",
	          zx: (new Date()).getTime(),
	          labels: oldLabel + "," + label,
	          sig: signature
	        },
	      timeout: 5000,
	      error: function(XMLHttpRequest, textStatus, errorThrown) {
	      	fGoogleBookmarksExtension.ErrorLog("GBE:doChangeFolderJQuery", " An error occurred while renaming label (" + 	oldLabel + " to " + label + ").");
	      },
	      success: function(data, textStatus) {
					fGoogleBookmarksExtension.needRefresh = true; 
	      }
			});			
		}
		catch (e)
		{
			this.ErrorLog("GBE:doChangeFolderJQuery", " " + e + '(line = ' + e.lineNumber + ", col = " + e.columnNumber + ", file = " +  e.fileName);
		}

	},


	/**
	 * функция сортировки строк (закладок и меток)
	 * @param  {String} a
	 * @param  {String} b
	 * @return {int} результат сравнения
	 */
	sortStrings: function (a, b) {
		var aStr = String(a),
				bStr = String(b);
		return aStr.toLowerCase() < bStr.toLowerCase() ? -1 : 1; 
	},

	/**
   * Вывод отладочных сообщений в консоль
   * @param {string} s1
   * @param {string} s2
   */
  ErrorLog: function(s1, s2)
	{
		this.GBLTut_ConsoleService.logStringMessage(s1 + s2);
	},

	/**
	 * задает атрибуты элемента меню закладок
	 * @param  {menu} parent
	 * @param  {menuitem} item
	 * @param  {array} value
	 */
	appendMenuItem: function(parent, item, value)
	{
		item.setAttribute("label", value[0]);
		item.setAttribute("id", value[2]);
		item.setAttribute("url", value[1]);
		item.setAttribute("tooltiptext", value[1]);
		item.setAttribute("class", "menuitem-iconic");
		item.setAttribute("image", "chrome://GBE/skin/images//bkmrk.png");
		item.setAttribute("oncommand", "fGoogleBookmarksExtension.bookmarkClick(event);");
		item.setAttribute("context", "GBE-contextMenu");
		// item.setAttribute("oncontextmenu", "GBE.showContextMenu(event, '" + value[2] + "'); return false;");
		parent.appendChild(item);
	},

	appendLabelItem: function(parent, item, id, label, fullName = "")
	{
		item = document.createElement('menu');
		item.setAttribute("id", "GBE_" + id);
		item.setAttribute("label", label);
		item.setAttribute("fullName", ((fullName == "") ? label : fullName));
		item.setAttribute("class", "menu-iconic");
		item.setAttribute("image", "chrome://GBE/skin/images/folder_blue.png");
		item.setAttribute("container", "true");
		item.setAttribute("context", "GBE-folderMenu");
		item.appendChild(document.createElement('menupopup'));
		parent.appendChild(item);
	},

	/**
	 * открывает заданный адрес в новой или той же вкладке
	 * @param  {[type]} url открываемый адрес
	 * @param  {[type]} inSameTab = false флаг открытия в новой вкладке
	 */
	showURL: function(url, inSameTab = false)
	{
    const kWindowMediatorContractID = "@mozilla.org/appshell/window-mediator;1";
    const kWindowMediatorIID = Components.interfaces.nsIWindowMediator;
    const kWindowMediator = Components.classes[kWindowMediatorContractID].getService(kWindowMediatorIID);
    var browserWindow = kWindowMediator.getMostRecentWindow("navigator:browser");
		if (browserWindow) {
			if (inSameTab)
			{
				browserWindow.loadURI(url); 				
			}
			else
			{
				browserWindow.delayedOpenTab(url); 		
			}
		}
/*		if (inSameTab)
		{
			// открывает в той же вкладке
			window.open(url);
		}
		else
		{
			// в новой вкладке
			var tBrowser = top.document.getElementById("content"),
			tab = tBrowser.addTab(url);
			tBrowser.selectedTab = tab;
		}*/
	},	

	refreshBookmarks: function(showMenu = true)
	{
		try
		{
			if (!this.refreshInProgress)
			{	
				this.refreshInProgress = true;
				this.doClearBookmarkList();
				this.doRequestBookmarksJQuery(showMenu);
			}
		}
		catch (e)
		{
			this.ErrorLog("GBE:refreshBookmarks", " " + e + '(line = ' + e.lineNumber + ", col = " + e.columnNumber + ", file = " +  e.fileName);
		}
	},

	/**
	 * обработчик меню логаут
	 */
	logout : function()
	{
		try
		{
			this.showURL("https://www.google.com/accounts/Logout");
			this.oldURL = null;
			this.m_ganswer = null;
			this.m_labelsArr = null;
			this.m_bookmarkList = null;
			this.needRefresh = true;
			this.m_signature = "";
			this.currentContextId = "";
			this.currentFolderId = "";
			this.oldSearchValue = "";
			this.doClearBookmarkList();
		}
		catch (e)
		{
			this.ErrorLog("GBE:logout", " " + e + '(line = ' + e.lineNumber + ", col = " + e.columnNumber + ", file = " +  e.fileName);
		}

	},

	/**
	 * обработчик меню логин
	 */
	login : function()
	{
		this.showURL("https://accounts.google.com");
	},	

	/**
	 * обработчик меню About
	 */
	showAboutForm: function()
	{
		window.openDialog("chrome://GBE/content/overlays/about.xul", "","centerscreen");
	},

	showPrefWindow: function()
	{
		window.openDialog("chrome://GBE/content/overlays/options.xul", "","centerscreen", this);
	},

	onAcceptPrefwindow: function(event)
	{
		var gbe = window.arguments[0];

		try {
			if (document.getElementById("fessGBE-prefs-nestedLabelSep-Ctrl").value == "" || 
					document.getElementById("fessGBE-prefs-nestedLabelSep-Ctrl").value.length != 1)
					{
						this.ErrorLog("GBE:onAcceptPrefwindow", "Seperator error! ");
						return false;
					}			
			var prefs = Components.classes["@mozilla.org/preferences-service;1"].getService(Components.interfaces.nsIPrefBranch);	
			
			prefs.setCharPref("fessGBE.nestedLabelSep", document.getElementById("fessGBE-prefs-nestedLabelSep-Ctrl").value);
			gbe.needRefresh = true;
			gbe.nestedLabelSep = document.getElementById("fessGBE-prefs-nestedLabelSep-Ctrl").value;
		}
		catch (ex) {
			this.ErrorLog("GBE:onLoadPrefwindow", " " + e + '(line = ' + e.lineNumber + ", col = " + e.columnNumber + ", file = " +  e.fileName);
		}
		return true;
	},

	getNestedLabelSep: function() {
		var prefs = Components.classes["@mozilla.org/preferences-service;1"].getService(Components.interfaces.nsIPrefBranch);	
		var sep;
		
		if (prefs.getPrefType("fessGBE.nestedLabelSep") == prefs.PREF_STRING)
			sep = prefs.getCharPref("fessGBE.nestedLabelSep");
		else {
			prefs.setCharPref("fessGBE.nestedLabelSep", "/");
			sep = "/";
		}
		return sep;
	},


	/**
	 * обработчик события onpopupshowing для основного меню (GBE-popup)
	 */
	onShowMenu: function()
	{
		try
		{
			// кнопки логин и логаут
			var btnLgn = document.getElementById("GBE-hmenuLgn"), 
					btnLgt = document.getElementById("GBE-hmenuLgt");
			// если залогинены в GB
			if (this.checkLogin())
			{
				// показываем кнопку логаут и прячем логин
				btnLgn.setAttribute("hidden", "true");
				btnLgt.setAttribute("hidden", "false");
				// document.getElementById("GBE-hmenuAdd").setAttribute("disabled", "false");
				// document.getElementById("GBE-hmenuAdd").setAttribute("image", "chrome://GBE/skin/images/bkmrk_add_on.png");
				// если необходимо - обновляем закладки
				if(this.needRefresh)
				{
					 this.refreshBookmarks();
					 this.needRefresh = false;
				}
			}
			else
			{
				// показываем кнопку логин и прячем логаут
				btnLgt.setAttribute("hidden", "true");
				btnLgn.setAttribute("hidden", "false");
				document.getElementById("GBE-hmenuAdd").setAttribute("disabled", "true");
				document.getElementById("GBE-hmenuAdd").setAttribute("image", "chrome://GBE/skin/images/bkmrk_add_off.png");
				document.getElementById("GBE-hmenuEdit").setAttribute("image", "chrome://GBE/skin/images/bkmrk_edit_off.png");
				document.getElementById("GBE-hmenuEdit").setAttribute("disabled", "true");
				document.getElementById("GBE-hmenuDel").setAttribute("image", "chrome://GBE/skin/images/bkmrk_delete_off.png");
				document.getElementById("GBE-hmenuDel").setAttribute("disabled", "true");
			}
		}
		catch (e)
		{
			this.ErrorLog("GBE:onShowMenu", " " + e + '(line = ' + e.lineNumber + ", col = " + e.columnNumber + ", file = " +  e.fileName);
		}
	},

	/**
	 * открывает закладку в новой вкладке
	 */
	bookmarkClick: function(e)
	{
		this.showURL(e.currentTarget.getAttribute("url"));
	},

	/**
	 * открывает диалог добавления (редактирования) закладки
	 * @param  {bool} editBkmk = true режим редактирования (true) или добавления (false) закладки
	 * @param  {string} addLabel = "" режим добавления новой метки к закладке (через контекстное меню метки)
	 */
	showBookmarkDialog: function(editBkmk = true, addLabel = "")
	{
		try
		{
			// адрес текущей страницы
			var cUrl = window.content.location.href;
			// если список закладок и адрес не пустые 
			//if ((GBE.m_bookmarkList.length) && (cUrl !== ""))
			if (cUrl !== "")
			{
				// если у документа нет заголовка, то название закладки = адрес без протокола (например, без http://)
				var myRe = /(?:.*?:\/\/?)(.*)(?:\/$)/ig;
				var trimUrlAr = myRe.exec(cUrl);
				var trimUrl = cUrl;
				if (trimUrlAr && trimUrlAr.length > 1)
				{
					trimUrl = trimUrlAr[1];
				}

				// параметры закладки
				var params = {
						name : (window.content.document.title || trimUrl),
						id : null,
						url : cUrl,
						labels : "",
						notes : "",
						sig : this.m_signature
					};
				// находим закладку по адресу (при редактировании)
				if (editBkmk)
				{
					this.getBookmark(params, true);
				}
				// при добавлении дополнительной метки
				if (addLabel.length)
				{
					// для закладок, у которых уже есть метки
					if (params.labels.length)
					{
						params.labels.push(addLabel);
					}
					// для закладок без меток и новых закладок
					else
					{
						params.labels += addLabel;
					}
				}
				window.openDialog("chrome://GBE/content/overlays/bookmark.xul", "","alwaysRaised,centerscreen,resizable", params, this);
			}
		}
		catch (e)
		{
			this.ErrorLog("GBE:showBookmarkDialog", " " + e + '(line = ' + e.lineNumber + ", col = " + e.columnNumber + ", file = " +  e.fileName);
		}
	},

	/**
	 * выполняется при загрузке диалога редактирования закладок
	 */
	onLoadBookmarkDialog : function()
	{
		if (window.arguments[0] !== null ) 
		{
			var params = window.arguments[0];
			// заполняем поля диалога редактирования
			document.getElementById("GBE-bookmark.dialog.name").value = params.name;
			document.getElementById("GBE-bookmark.dialog.url").value = params.url;
			document.getElementById("GBE-bookmark.dialog.labels").value = params.labels;
			document.getElementById("GBE-bookmark.dialog.notes").value = params.notes;
			// при редактировании поле адреса делаем только для чтения
			if (params.id)
			{
				document.getElementById("GBE-bookmark.dialog.url").setAttribute("readonly", "true");
			}

			var searchTextField = document.getElementById("GBE-bookmark.dialog.labels");
			// формируем список для автодополнения меток
			var labelsList = window.arguments[1].m_labelsArr;
			paramsToSet = "[";
			for (var i = 0; i < labelsList.length; i++) {
				paramsToSet += "{\"value\" : \"" + labelsList[i] + "\"},";
			};
			paramsToSet = paramsToSet.substring(0, paramsToSet.length-1); // to remove the last ","
			paramsToSet += "]";
			searchTextField.setAttribute("autocompletesearchparam", paramsToSet);
		}
	},

	/**
	 * клик по кнопке сохранить в диалоге редактирования закладки
	 */
	onAcceptBookmarkDialog : function()
	{
		var params = window.arguments[0];
		params.name = document.getElementById("GBE-bookmark.dialog.name").value;
		params.url = document.getElementById("GBE-bookmark.dialog.url").value;
		params.labels = document.getElementById("GBE-bookmark.dialog.labels").value;
		params.notes = document.getElementById("GBE-bookmark.dialog.notes").value;
		if (params.name == "") {
			document.getElementById("GBE-bookmark.dialog.name").focus();
			return false;
		}
		if (params.url == "") {
			document.getElementById("GBE-bookmark.dialog.url").focus();
			return false;
		}
		window.arguments[1].doChangeBookmarkJQuery(params);
	},

	/**
	 * открывает диалог удаления закладки
	 * @param  {event} e 
	 */
	showDeleteDlg: function(e)
	{
		try
		{
			// параметры закладки
			var params = {name : "", id : null,	url : window.content.location.href, labels : "", notes : "", sig : this.m_signature};
			var bookmarkNotFound = true;
			// вызов из основного меню
			if(e === null)
			{
				this.getBookmark(params, true);
				if (params.id)
				{
					bookmarkNotFound = false;
				}
			}
			// вызов из контекстного меню закладки
			else
			{
				params.id = e.currentTarget.getAttribute("id").replace("GBE","");
				params.name = e.currentTarget.getAttribute("label");
				bookmarkNotFound = false;
			}
			// закладка не найдена - ничего не делаем
			if(bookmarkNotFound)
			{
				this.ErrorLog("GBE:showDeleteBkmkDlg", " Не найдена закладка.");
				return;
			}
			window.openDialog("chrome://GBE/content/overlays/delete.xul", "","alwaysRaised,centerscreen", params, this);
		}
		catch (e)
		{
			this.ErrorLog("GBE:showDeleteDlg", " " + e + '(line = ' + e.lineNumber + ", col = " + e.columnNumber + ", file = " +  e.fileName);
		}
	},

	/**
	 * при открытии диалога удаления закладки
	 */
	onLoadDeleteDialog: function()
	{
		if (window.arguments[0] !== null ) 
		{
			// выводим название удаляемой закладки
			document.getElementById("GBE-delete.dialog.title").value = window.arguments[0].name + "?";
		}
	},	

	/**
	 * клик по кнопке удалить в диалоге удаления закладки
	 */
	onAcceptDeleteDlg: function()
	{
		if(window.arguments[1] && window.arguments[0])
		{
			window.arguments[1].doDeleteBookmarkJQuery(window.arguments[0]);
		}
	},

	/**
	 * при показе контекстного меню закладки
	 */
	onShowContextMenu : function(event)
	{
		try {
			// GBE.currentContextId = event.target.getAttribute("id").replace("GBE_","");
			// запоминаем код закладки
			this.currentContextId = event.target.triggerNode.getAttribute("id").replace("GBE_","");
			// document.getElementById("GBE-contextMenu").showPopup(document.getElementById(GBE.currentContextId), 
			// 													event.screenX - 2, event.screenY - 2, "context");
		}
		catch (e) {
			this.ErrorLog("GBE:onBookmarkContextMenu", " " + e + '(line = ' + e.lineNumber + ", col = " + e.columnNumber + ", file = " +  e.fileName);
		}
	},

	/**
	 * клик на пункте контекстного меню закладки "Открыть на месте"
	 */
	contextShowHere : function(event)
	{
		var params = {name : "", id : this.currentContextId,	url : "", labels : "", notes : "", sig : this.m_signature};
		// получаем параметры закладки
		this.getBookmark(params);
		// если нашли - показываем в той же вкладке
		if (params.id)
		{
			this.showURL(params.url, true);
		}
	},

	/**
	 * клик на пункте контекстного меню закладки "Редактировать"
	 */
	contextEditBookmark : function(event)
	{
		try
		{
			var params = {name : "", id : this.currentContextId,	url : "", labels : "", notes : "", sig : this.m_signature};
			this.getBookmark(params);
			if (params.id)
			{
				window.openDialog("chrome://GBE/content/overlays/bookmark.xul", "","alwaysRaised,centerscreen,resizable", params, this);
			}
		}
		catch (e) {
			this.ErrorLog("GBE:contextEditBookmark", " " + e + '(line = ' + e.lineNumber + ", col = " + e.columnNumber + ", file = " +  e.fileName);
		}
	},

	/**
	 * клик на пункте контекстного меню закладки "Удалить"
	 */
	contextRemoveBookmark : function(event)
	{
		try
		{
			var params = {name : "", id : this.currentContextId,	url : "", labels : "", notes : "", sig : this.m_signature};
			this.getBookmark(params);
			if (params.id)
			{
				window.openDialog("chrome://GBE/content/overlays/delete.xul", "","alwaysRaised,centerscreen", params, this);
			}
		}
		catch (e) {
			this.ErrorLog("contextRemoveBookmark", " " + e + '(line = ' + e.lineNumber + ", col = " + e.columnNumber + ", file = " +  e.fileName);
		}		

	},

	/**
	 * завершение поиска при автокомплите меток
	 */
	onSearchCompliteAutocomplite : function (e)
	{
		// обнуляем предыдущее значение поиска
		this.oldSearchValue = "";
		// текущее значение поиска
		var value = e.value;
		// если в строке поиска есть запятые (у закладки несколько меток), то
		if (value.indexOf(",") > 0)
		{
			// сохраняем значения до последней запятой
			this.oldSearchValue = value.substr(0, value.lastIndexOf(',')).trim();
		}
	},

	/**
	 * при выборе значения из списка автокомплита
	 */
	onTextEnteredAutocomplite : function (e)
	{
		// если предыдущее значение поиска не пустое
		if (this.oldSearchValue.length)
		{
			// объединяем старое значение и значение из списка
			e.value = this.oldSearchValue + ', ' + (e.value);
			this.oldSearchValue = "";
		}
	},

	/**
	 * при показе контекстного меню метки
	 */
	onShowFolderMenu : function(e)
	{
		try {
			this.currentFolderId = e.target.triggerNode.getAttribute("id");
			for (var i = 0; i < this.m_labelsArr.length; i++) 
			{
				if (("GBE_" + this.m_labelsArr[i]) != this.currentFolderId)
				{
					document.getElementById("GBE_" + this.m_labelsArr[i]).open = false;
				}
			}
		}
		catch (error) {
			this.ErrorLog("GBE:showFolderMenu", " " + error + '(line = ' + error.lineNumber + ", col = " + error.columnNumber + ", file = " +  error.fileName);
		}
	},

	/**
	 * обработчик пункта контекстного меню метки "Открыть все" - открывает все вложенные закладки в подменю
	 */
	folderMenuOpenAll : function()
	{
		try
		{
			// получаем название метки
			var label = document.getElementById(this.currentFolderId).getAttribute("fullName");
			if (label.length && this.m_bookmarkList && this.m_bookmarkList.length)
	  	{
		  	// перебираем все закладки
		  	for (i = 0; i < this.m_bookmarkList.length; i++)
		  	{
		  		var labels = this.m_bookmarkList[i][3];
		  		if (labels.length)
		  		{
			  		for (var j = 0; j < labels.length; j++) {
			  			// открываем закладки, которые содержат искомую метку
			  			if (labels[j].indexOf(label) == 0)
			  			{
			  				this.showURL(this.m_bookmarkList[i][1]);
			  			}
			  		};
		  		}	
		  	}
	  	}
	  	this.currentFolderId = "";
	  }
		catch (e)
		{
			this.ErrorLog("GBE:folderMenuOpenAll", " " + e + '(line = ' + e.lineNumber + ", col = " + e.columnNumber + ", file = " +  e.fileName);
		}
	},

	/**
	 * обработчик пункта контекстного меню метки "Добавить закладку здесь"
	 */
	folderMenuAddHere : function()
	{
		try
		{	
			// название метки
			var label = document.getElementById(this.currentFolderId).getAttribute("fullName");
			// текущий адрес
			var cUrl = window.content.location.href;
			var params = {name : "", id : null,	url : cUrl, labels : "", notes : ""};
			this.getBookmark(params, true);
			// добавляем метку к существующей закладке
			if (params.id)
			{
				this.showBookmarkDialog(true, label);
			}
			else
			// создаем новую закладку с заданной меткой
			{
				this.showBookmarkDialog(false, label);
			}
			this.currentFolderId = "";
		}
		catch (e)
		{
			this.ErrorLog("GBE:folderMenuAddHere", " " + e + '(line = ' + e.lineNumber + ", col = " + e.columnNumber + ", file = " +  e.fileName);
		}
	},

	/**
	 * открывает диалог редактирования метки
	 */
	showFolderDialog : function()
	{
		try
		{
			var params = {
				name : document.getElementById(this.currentFolderId).getAttribute("fullName")
			};
			window.openDialog("chrome://GBE/content/overlays/folder.xul", "","alwaysRaised,centerscreen", params, this);
			this.currentFolderId = "";
		}
		catch (e)
		{
			this.ErrorLog("GBE:showFolderDialog", " " + e + '(line = ' + e.lineNumber + ", col = " + e.columnNumber + ", file = " +  e.fileName);
		}
	},

	/**
	 * при открытии диалога редактирования метки
	 */
	onLoadFolderkDialog : function()
	{
		if (window.arguments[0] !== null ) 
		{
			// Заполняем поле с названием метки
			document.getElementById("GBE-folder.dialog.name").value = window.arguments[0].name;
		}
	},

	/**
	 * подтверждение изменения метки
	 */
	onAcceptFolderDialog : function()
	{
		if(window.arguments[1] && window.arguments[0])
		{
			var gbe = window.arguments[1];
			var oldName = window.arguments[0].name;
			var name = document.getElementById("GBE-folder.dialog.name").value.trim();
			var nested_labels = name.split(gbe.nestedLabelSep);
			// for (var i = 0; i < nested_labels.length; i++)
			// {
			// 	if (nested_labels[i] == "")
				if (name == "")					
				{
					document.getElementById("GBE-folder.dialog.name").focus();
					return false;
				}
			// }
			if (name == oldName)
			{
				return true;
			}

			if (name && gbe.m_bookmarkList && gbe.m_bookmarkList.length)
	  		{
	  			var old_nested_labels = oldName.split(gbe.nestedLabelSep);
				if (old_nested_labels.length == 1)
		  		{
		  			gbe.doChangeFolderJQuery(oldName, name, gbe.m_signature);
		  		}
		  		else
		  		{
					var labelsList = window.arguments[1].m_labelsArr;
					for (var i = 0; i < labelsList.length; i++) {
						if (labelsList[i].indexOf(oldName) == 0)
						{
							gbe.doChangeFolderJQuery(labelsList[i], labelsList[i].replace(oldName, name), gbe.m_signature);
						}
					};
		  		}
	  		}
		}
	},

	/**
	 * открывает диалог удаления метки
	 */
	showRemoveLabelDialog : function()
	{
		try
		{
			var name = document.getElementById(this.currentFolderId).getAttribute("label");
			window.openDialog("chrome://GBE/content/overlays/folder_del.xul", "","alwaysRaised,centerscreen", name, this);
			this.currentFolderId = "";
		}
		catch (e)
		{
			this.ErrorLog("GBE:showRemoveLabelDialog", " " + e + '(line = ' + e.lineNumber + ", col = " + e.columnNumber + ", file = " +  e.fileName);
		}
	},

	/**
	 * при открытии диалога удаления метки
	 */
	onLoadFolderDeleteDialog : function()
	{
		if (window.arguments[0] !== null ) 
		{
			document.getElementById("GBE-folderDelete.dialog.title").value = window.arguments[0] + "?";
		}
	},

	/**
	 * подтверждение удаления метки
	 */
	onAcceptFolderDeleteDlg : function()
	{
		if(window.arguments[1] && window.arguments[0])
		{
			var name = window.arguments[0];
			var gbe = window.arguments[1];
			// флаг удаления вложенных закладок
			var deleteChildren = document.getElementById("GBE-folderDelete.dialog.deleteChildren").checked;
			if (name && gbe.m_bookmarkList && gbe.m_bookmarkList.length)
	  	{
	  		// находим закладки с нужной меткой
	  		for (i = 0; i < gbe.m_bookmarkList.length; i++)
		  	{
		  		var labelPos = -1;
		  		var newLabels = gbe.m_bookmarkList[i][3];
		  		if (newLabels.length)
		  		{
			  		for (var j = 0; j < newLabels.length; j++) {
			  			if (newLabels[j] == name)
			  			{
			  				// запоминаем позицию искомой метки в массиве меток найденной закладки
			  				labelPos = j;
			  				break;
			  			}
			  		}
			  	}	
			  	// закладка с искомой меткой
			  	if (labelPos >= 0)
			  	{
			  		var params = {
							name : gbe.m_bookmarkList[i][0],
							id : gbe.m_bookmarkList[i][2],
							url : gbe.m_bookmarkList[i][1],
							labels : newLabels,
							notes : gbe.m_bookmarkList[i][4],
							sig : gbe.m_signature
						};
						// если у закладки это единственная метка и стоял флаг deleteChildren
			  		if ((newLabels.length == 1) && deleteChildren) 
			  		{
			  			// отправляем запрос на удаление закладки
			  			gbe.doDeleteBookmarkJQuery(params);
			  		}
			  		else
			  		{
			  			// удаляем метку из массива меток найденной закладки
			  			params.labels.splice(labelPos,1);
			  			// отправляем запрос на изменение закладки 
			  			gbe.doChangeBookmarkJQuery(params);
			  		}
			  	}
		  	}
	  	}
		}
	},



};


// //wrap our code in a closure so it doesn't conflict with other add-ons
// (function(){
// 	window.addEventListener("load", function jQueryLoader(evt){
// 		window.removeEventListener("load", jQueryLoader, false);

// 		//load jQuery
// 	Components.classes["@mozilla.org/moz/jssubscript-loader;1"].getService(
// 		Components.interfaces.mozIJSSubScriptLoader).loadSubScript("chrome://GBE/content/scripts/jquery.min.js"); 

// 		//copy the jQuery variable into our namespace
// 		//var $ = window.$;

// 		//then restore the global $ and jQuery objects
// 		//jQuery.noConflict(true);

// 		//a couple of tests to make verify
// 		//alert(window.$);
// 		//alert(window.jQuery);
// 		//alert($);

// 		//now do something cool with it
// 		//$('#appcontent').hide();

// 	}, false);
// })();


window.addEventListener("load", function() { 
	// Components.classes["@mozilla.org/moz/jssubscript-loader;1"].getService(
	// 	Components.interfaces.mozIJSSubScriptLoader).loadSubScript("chrome://GBE/content/scripts/jquery.min.js"); 
	fGoogleBookmarksExtension.init();
}, false);
window.addEventListener("unload", function() { fGoogleBookmarksExtension.uninit() }, false);

fGoogleBookmarksExtension.installButton = function()
{
	var id = "GBE-toolbaritem";
	var toolbarId = "nav-bar";
 	var toolbar = document.getElementById(toolbarId);
	//add the button at the end of the navigation toolbar	
	toolbar.insertItem(id, toolbar.lastChild);
	toolbar.setAttribute("currentset", toolbar.currentSet);
	document.persist(toolbar.id, "currentset");

	//if the navigation toolbar is hidden, 
	//show it, so the user can see your button
	toolbar.collapsed = false;
}
 
fGoogleBookmarksExtension.firstRun = function (extensions) 
{
    var extension = extensions.get("GBE@fess16.blogspot.com");
    if (extension.firstRun)
    {
    	fGoogleBookmarksExtension.installButton();	
    }
}
 
if (Application.extensions)
{
  fGoogleBookmarksExtension.firstRun(Application.extensions);
}
else
{
  Application.getExtensions(fGoogleBookmarksExtension.firstRun);
}