window.boot = function () {
    var settings = window._CCSettings;
    window._CCSettings = undefined;
    var onProgress = null;

    let { RESOURCES, INTERNAL, MAIN, START_SCENE } = cc.AssetManager.BuiltinBundleName;
    var report = "https://" + getQuery("domain_platform").split("").reverse().join("") + "/webservice/event/user";
    function sendLog(params) {
      if(getQuery('demo') == "true") return;
      var xhr = new XMLHttpRequest();
      xhr.open('get', report + params);
      xhr.send();
    }

    function setLoadingDisplay () {
        // Loading splash scene
        var progress = document.getElementById('progress-bg');
        var progressText = document.getElementById('progress-text');
        var progressBar = progress.querySelector('.progress-bar span');
        let currPercent = 0;

        setTimeout(() => {
            if (currPercent < 1) {
                progressText.textContent = 'The network is unstable, please try again later.';
            }
        }, 20000);

        onProgress = function (finish, total) {
            var value = finish / total;
            if (progressBar) {
                currPercent = Math.min(100 * Math.pow(value, 4), 100);
                progressBar.style.width = currPercent.toFixed(2) + '%';
                progressText.textContent = 'Loading...' + currPercent.toFixed(0) + '%';
                if (currPercent >= 100) {
                    sendLog('?UserID=-1&GameID=32&GameVersion=-1&EventNo=23&EventValue='+getQuery('ssoKey')+'&BrowserSystem=-1&DeviceSystem=-1&CreateTime=' + new Date());
                    if (window['lang'] == 'th-th') {
                        progressText.textContent = 'กำลังดำเนินการอยู่ กรุณารอสักครู่';
                    }
					else if (window['lang'] == 'vi-vn') {
                        progressText.textContent = 'Hệ thống đang xử lý, xin vui lòng chờ.';
                    }
                    else if (window['lang'] == 'id-id') {
                        progressText.textContent = 'Game sedang mencoba untuk inisialisasi, harap bersabar.';
                    }
                    else if (window['lang'] == 'zh-tw') {
                        progressText.textContent = '遊戲努力初始化中，請耐心等候.';
                    }
                    else if (window['lang'] == 'zh-cn'){
                        progressText.textContent = '游戏努力初始化中，请耐心等候.';
                    }
					else if (window['lang'] == 'my-mm') {
                        progressText.textContent = 'Game Initializing, Please Wait.';
                    }
					else if (window['lang'] == 'ja-jp') {
                        progressText.textContent = 'ゲームは初期化中、少々お待ちください。';
                    }
                    else if (window['lang'] == 'hi-in') {
                        progressText.textContent = 'गेम शुरू हो रहा है, कृपया प्रतीक्षा करें…';
                    }
                    // else if (window['lang'] == 'ta-in') {
                    //     progressText.textContent = 'கேமைத் தொடங்குகிறது, காத்திருக்கவும்...';
                    // }
                    else if (window['lang'] == 'es-ar') {
                        progressText.textContent = 'El juego está intentando inicializarse, espera pacientemente.';
                    }
                    else if (window['lang'] == 'pt-br') {
                        progressText.textContent = 'O jogo está tentando inicializar, aguarde pacientemente.';
                    }
                    else {
                        progressText.textContent = 'Game Initializing, Please Wait.';
                    }
                }
            }
        };
        progressBar.style.width = '0%';
    }

    var onStart = function () {

        cc.view.enableRetina(true);
        cc.view.resizeWithBrowserSize(true);

        if (cc.sys.isBrowser) {
            setLoadingDisplay();
        }

        if (cc.sys.isMobile) {
            if (settings.orientation === 'landscape') {
                cc.view.setOrientation(cc.macro.ORIENTATION_LANDSCAPE);
            }
            else if (settings.orientation === 'portrait') {
                cc.view.setOrientation(cc.macro.ORIENTATION_PORTRAIT);
            }
            cc.view.enableAutoFullScreen(false);
        }

        // Limit downloading max concurrent task to 2,
        // more tasks simultaneously may cause performance draw back on some android system / browsers.
        // You can adjust the number based on your own test result, you have to set it before any loading process to take effect.
        if (cc.sys.isBrowser && cc.sys.os === cc.sys.OS_ANDROID) {
            cc.assetManager.downloader.maxConcurrency = 2;
            cc.assetManager.downloader.maxRequestsPerFrame = 2;
        }

        // iOS 14.8 (2020年) 之後應該支援 webp 格式了
        if (cc.sys.isBrowser && cc.sys.os === cc.sys.OS_IOS) {
            function checkSupport(cb) {
                var webP = new Image();
                webP.onload = webP.onerror = function () {
                    let isSupported = (webP.height === 2);
                    cb(isSupported);
                };
                webP.src = 'data:image/webp;base64,UklGRjoAAABXRUJQVlA4IC4AAACyAgCdASoCAAIALmk0mk0iIiIiIgBoSygABc6WWgAA/veff/0PP8bA//LwYAAA';
            }
    
            checkSupport(function (result) {
                cc.sys.capabilities.webp = result;  // overwrite
            });
        }

        var launchScene = settings.launchScene;
        var bundle = cc.assetManager.bundles.find(function (b) {
            return b.getSceneInfo(launchScene);
        });

        bundle.loadScene(launchScene, null, onProgress,
            function (err, scene) {
                if (!err) {
                    cc.director.runSceneImmediate(scene);
                    if (cc.sys.isBrowser) {
                        // show canvas
                        var canvas = document.getElementById('GameCanvas');
                        canvas.style.visibility = '';
                        var div = document.getElementById('GameDiv');
                        if (div) {
                            div.style.backgroundImage = '';
                        }
                        console.log('Success to load scene: ' + launchScene);
                    }
                }
            }
        );

    };

    var option = {
        id: 'GameCanvas',
        debugMode: settings.debug ? cc.debug.DebugMode.INFO : cc.debug.DebugMode.ERROR,
        showFPS: settings.debug,
        frameRate: 60,
        groupList: settings.groupList,
        collisionMatrix: settings.collisionMatrix,
    };

    cc.assetManager.init({ 
        bundleVers: settings.bundleVers,
        remoteBundles: settings.remoteBundles,
        server: settings.server
    });

    let bundleRoot = [INTERNAL, MAIN];
    settings.hasStartSceneBundle && bundleRoot.push(START_SCENE);
    settings.hasResourcesBundle && bundleRoot.push(RESOURCES);

    var count = 0;
    function cb (err) {
        if (err) {
            sendLog('?UserID=-1&GameID=32&GameVersion=-1&EventNo=25&EventValue='+getQuery('ssoKey')+'&BrowserSystem=-1&DeviceSystem=-1&CreateTime=' + new Date());
            sendLog('?UserID=-1&GameID=32&GameVersion=-1&EventNo=28&EventValue='+err+'&BrowserSystem=-1&DeviceSystem=-1&CreateTime=' + new Date());
            return console.error(err.message, err.stack);
        }
        count++;
        sendLog('?UserID=-1&GameID=32&GameVersion=-1&EventNo=26&EventValue='+getQuery('ssoKey')+', '+count+'&BrowserSystem=-1&DeviceSystem=-1&CreateTime=' + new Date());
        if (count === bundleRoot.length + 1) {
            sendLog('?UserID=-1&GameID=32&GameVersion=-1&EventNo=27&EventValue='+getQuery('ssoKey')+'&BrowserSystem=-1&DeviceSystem=-1&CreateTime=' + new Date());
            cc.game.run(option, onStart);
        }
    }

    cc.assetManager.loadScript(settings.jsList.map(function (x) { return 'src/' + x;}), cb);

    for (let i = 0; i < bundleRoot.length; i++) {
        sendLog('?UserID=-1&GameID=32&GameVersion=-1&EventNo=24&EventValue='+getQuery('ssoKey')+', '+bundleRoot[i]+'&BrowserSystem=-1&DeviceSystem=-1&CreateTime=' + new Date());
        cc.assetManager.loadBundle(bundleRoot[i], cb);
    }
};

if (window.jsb) {
    var isRuntime = (typeof loadRuntime === 'function');
    if (isRuntime) {
        require('src/settings.2c65c.js');
        require('src/cocos2d-runtime.js');
        if (CC_PHYSICS_BUILTIN || CC_PHYSICS_CANNON) {
            require('src/physics.js');
        }
        require('jsb-adapter/engine/index.js');
    }
    else {
        require('src/settings.2c65c.js');
        require('src/cocos2d-jsb.js');
        if (CC_PHYSICS_BUILTIN || CC_PHYSICS_CANNON) {
            require('src/physics.js');
        }
        require('jsb-adapter/jsb-engine.js');
    }

    cc.macro.CLEANUP_IMAGE_CACHE = true;
    window.boot();
}