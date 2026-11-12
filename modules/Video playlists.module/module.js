// Gets all instances of video modules that have "Video type" set to "Embed"
const oembedContainers = document.getElementsByClassName('oembed_container');
const embedContainers = document.getElementsByClassName('embed_container');

// Function for "Embed type" of "Embed URL"
function loadOEmbed(container) {
  const embedContainer = container;
  const iframeWrapper = embedContainer.querySelector('.iframe_wrapper');
  const customThumbnail = embedContainer.querySelector('.oembed_custom-thumbnail');
  const url = iframeWrapper.dataset.embedUrl;

  if (url) {
    function setIframe(data) {
      let {
        maxHeight,
        maxWidth,
        height,
        width,
      } = iframeWrapper.dataset;
      maxHeight = maxHeight !== undefined && !maxHeight ? data.height : maxHeight;
      maxWidth = maxWidth !== undefined && !maxWidth ? data.width : maxWidth;
      height = height !== undefined && !height ? data.height : height;
      width = width !== undefined && !width ? data.width : width;
      const el = document.createElement('div');
      el.innerHTML = data.html;
      const iframe = el.firstChild;
      iframe.setAttribute("class", "oembed_container_iframe");
      iframe.setAttribute("title", data.title);
      if (customThumbnail) {
        customThumbnail.onclick = function() {
          const iframeSrc = new URL(iframe.src);
          iframeSrc.searchParams.append('autoplay', 1);
          iframe.src = iframeSrc.toString();
          this.setAttribute('class', 'oembed_custom-thumbnail--hide');
          iframeWrapper.appendChild(iframe);
        };
      } else {
        iframeWrapper.appendChild(iframe);
      }
      if (maxHeight) {
        const maxHeightStr = maxHeight.toString(10) + "px";
        embedContainer.style.maxHeight = maxHeightStr;
        iframe.style.maxHeight = maxHeightStr;
        if (customThumbnail) {
          customThumbnail.style.maxHeight = maxHeightStr;
        }
      }
      if (maxWidth) {
        const maxWidthStr = maxWidth.toString(10) + "px";
        embedContainer.style.maxWidth = maxWidthStr;
        iframe.style.maxWidth = maxWidthStr;
        if (customThumbnail) {
          customThumbnail.style.maxWidth = maxWidthStr;
        }
      }
      if (height) {
        const heightStr = height.toString(10) + "px";
        embedContainer.style.height = heightStr;
        iframe.style.height = heightStr;
        if (customThumbnail) {
          customThumbnail.style.height = heightStr;
        }
      }
      if (width) {
        const widthStr = width.toString(10) + "px";
        embedContainer.style.width = widthStr;
        iframe.style.width = widthStr;
        if (customThumbnail) {
          customThumbnail.style.width = widthStr;
        }
      }
    }
    const embedResponse = {
      html: iframeWrapper.dataset.embedResponseHtml,
      width: iframeWrapper.dataset.embedResponseWidth,
      height: iframeWrapper.dataset.embedResponseHeight
    };
    if (embedResponse.html) {
      setIframe(embedResponse);
      return;
    }

    const request = new XMLHttpRequest();
    const requestUrl = "/_hcms/oembed?url=" + encodeURIComponent(url) + "&autoplay=0";
    request.open('GET', requestUrl, true);
    request.onload = function() {
      if (request.status >= 200 && request.status < 400) {
        var data = JSON.parse(request.responseText);
        setIframe(data);
      } else {
        console.error('Server reached, error retrieving results.');
      }
    };
    request.onerror = function() {
      console.error('Could not reach the server.');
    };
    request.send();

  }
}

// Function for "Embed type" of "Embed code"
function loadEmbed(container) {
  const embedContainer = container;
  const iframe = embedContainer.querySelector('.iframe_wrapper iframe');

  const maxHeight = iframe.getAttribute('height');
  const maxWidth = iframe.getAttribute('width');

  if (maxHeight !== null ) {
    const heightStr = maxHeight.toString(10) + "px";
    embedContainer.style.maxHeight = heightStr;
  } else {
    iframe.style.height = '100%';
  }

  if (maxWidth !== null) {
    const widthStr = maxWidth.toString(10) + "px";
    embedContainer.style.maxWidth = widthStr;
  } else {
    iframe.style.width = '100%';
  }
}

// Check to only run oembed script if video module with "Embed type" of "Embed URL" is present
if (oembedContainers.length !== 0) {
  Array.prototype.forEach.call(oembedContainers, function(el) {
    loadOEmbed(el);
  });
}

// Check to only run embed script if video module with "Embed type" of "Embed code" is present
if (embedContainers.length !== 0) {
  Array.prototype.forEach.call(embedContainers, function(el) {
    loadEmbed(el);
  });
}
