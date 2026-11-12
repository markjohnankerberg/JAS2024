/* let fbShareBtn = document.querySelector("#fb-share-btn");
fbShareBtn &&
    fbShareBtn.addEventListener("click", function (e) {
        e.preventDefault();
        let url = encodeURIComponent(window.location.href),
            left = window.innerWidth / 2 - 275,
            top = window.innerHeight / 2 - 230;
        window.open(
            "https://www.facebook.com/sharer/sharer.php?u=" + url,
            "fbshare",
            "width=550,height=460,left=" + left + ",top=" + top
        );
    });

let twitterShareBtn = document.querySelector("#twitter-share-btn");
twitterShareBtn &&
    twitterShareBtn.addEventListener("click", function (e) {
        e.preventDefault();
        let text = encodeURIComponent(document.title),
            url = encodeURIComponent(window.location.href),
            left = window.innerWidth / 2 - 275,
            top = window.innerHeight / 2 - 230;
        window.open(
            "https://twitter.com/intent/tweet?text=" + text + "&url=" + url,
            "twittershare",
            "width=550,height=460,left=" + left + ",top=" + top
        );
    });

let linkedInShareBtn = document.querySelector("#linkedin-share-btn");
linkedInShareBtn &&
    linkedInShareBtn.addEventListener("click", function (e) {
        e.preventDefault();
        let title = encodeURIComponent(document.title),
            url = encodeURIComponent(window.location.href),
            left = window.innerWidth / 2 - 275,
            top = window.innerHeight / 2 - 230;
        window.open(
            "https://www.linkedin.com/sharing/share-offsite/?url=" +
                url +
                "&title=" +
                title,
            "linkedinshare",
            "width=550,height=460,left=" + left + ",top=" + top
        );
    });
*/

let copyUrlBtn = document.querySelector("#copy-url-btn");
copyUrlBtn &&
    copyUrlBtn.addEventListener("click", function (e) {
        e.preventDefault();
        let url = document.createElement("input");
        document.body.appendChild(url),
            (url.value = window.location.href),
            url.select(),
            document.execCommand("copy"),
            document.body.removeChild(url);
        let copyUrl = document.querySelector("#copy-url");
        copyUrl.classList.add("active"),
            setTimeout(function () {
                copyUrl.classList.remove("active");
            }, 1500);
    });
