/**
 * URL query parameters are passed through to the HubSpot content search API.
 *
 * q=<search term> term to be searched for
 *
 * Content type to search can be specified with the following types.
 * type=SITE_PAGE, LANDING_PAGE, BLOG_POST, LISTING_PAGE, and KNOWLEDGE_ARTICLE
 * Multiple content types can be searched by additional "type" query params.
 * ex. type=BLOG_POST&type=LISTING_PAGE
 *
 * offset=<offset> beginning offset of the result set
 * limit=<limit> page size
 *
 * See: https://developers.hubspot.com/docs/api/cms/site-search
 *
 */

const SEARCH_URL_BASE = '/_hcms/v3/site-search/search'; // v1
/* const SEARCH_URL_BASE = 'https://api.hubapi.com/contentsearch/v2/search'; */ // v2
/* const SEARCH_URL_BASE = '/contentsearch/v2/search'; */ // v3
/* const SEARCH_URL_BASE = '/cms/v3/site-search/search'; */  // v4
/* const SEARCH_URL_BASE = 'https://api.hubapi.com/cms/v3/site-search/search'; */ // v5

const SURROUNDING_PAGE_NUMBERS = 1; // how many page numbers to attempt to surround the current page with.
const searchResultsContainer = document.querySelectorAll('.hs-search-results');

/**
 * Grab JSON configuration for the module from the HubL data.
 */

const getModuleConfig = moduleName => {
  const configJSONScript = document.querySelector(
    `[data-${moduleName}-config]`
  );
  if (configJSONScript) {
    return JSON.parse(configJSONScript.textContent);
  }
  return {
    /* eslint-disable camelcase */
    search_results_heading_tag: 'h1',
    search_results_page_path: '',
    search_results_count_message:
      'Displaying [[offset]] – [[limit]] of [[total]] results',
    search_results_display_featured_images: false,
    featured_image_alt: 'Featured Image',
    first_page_link_text: 'First page',
    previous_page_link_text: 'Previous',
    next_page_link_text: 'Next',
    last_page_link_text: 'Last',
    no_results_message: 'No results message',
    navigation_aria_label: 'Paging Navigation',
    /* eslint-enable camelcase */
  };
};

const moduleConfig = getModuleConfig('search_results');

const getSearchPageUrl = pageOffset => {
  const currentPageParams = new URLSearchParams(window.location.search);
  currentPageParams.set('offset', pageOffset);
  return `${
    moduleConfig.search_results_page_path
  }?${currentPageParams.toString()}`;
};

/**
 * Given a total number of results, an offset, and a page size, returns an object full of pagination data for display.
 *
 * @param {number} totalItems the total number of items to be paginated
 * @param {number} currentOffset the current offset of the page
 * @param {number} pageSize the number of items per page
 * @returns {object} the paginator object with data for rendering pagination
 */

const getPaginator = (totalItems, currentOffset, pageSize) => {
  // default page size is 10
  pageSize = pageSize || 10;

  /**
   * Setting up variables
   */

  const maxPageNumbersToDisplay = SURROUNDING_PAGE_NUMBERS * 2 + 1;

  const centerPageSlot = Math.ceil(maxPageNumbersToDisplay / 2);

  // calculate total pages of items
  const totalPagesOfItems = Math.ceil(totalItems / pageSize);

  const currentPage = currentOffset / pageSize + 1;

  // calculate previous page url based on offset and page size
  const prevPageUrl =
    currentPage > 1 ? getSearchPageUrl(currentOffset - pageSize) : '';

  // calculate next page url based on offset and page size
  const nextPageUrl =
    currentPage < totalPagesOfItems
      ? getSearchPageUrl(currentOffset + pageSize)
      : '';

  /**
   *  Setting up functions.
   */

  // Page numbers are a rolling window of the current page, and attempt to center the current page in the navigation.
  const calculateBeginAndEndPageNumbers = () => {
    let firstDisplayedPageNumber;
    let lastDisplayedPageNumber;

    // There are less total pages than the maximum number of pages to display, so we can just display all of them.
    if (totalPagesOfItems <= maxPageNumbersToDisplay) {
      firstDisplayedPageNumber = 1;
      lastDisplayedPageNumber = totalPagesOfItems;
      return { firstDisplayedPageNumber, lastDisplayedPageNumber };
    }

    // The current page is less than the center page slot, so we start at 1.
    if (currentPage <= centerPageSlot) {
      firstDisplayedPageNumber = 1;
      lastDisplayedPageNumber = centerPageSlot + SURROUNDING_PAGE_NUMBERS;
      return { firstDisplayedPageNumber, lastDisplayedPageNumber };
    }

    // The current page is one away from the last, so we can end at the total number of pages.
    if (currentPage + 1 >= totalPagesOfItems) {
      firstDisplayedPageNumber = totalPagesOfItems - centerPageSlot;
      lastDisplayedPageNumber = totalPagesOfItems;
      return { firstDisplayedPageNumber, lastDisplayedPageNumber };
    }

    // The current page is somewhere in the middle, so we calculate to try and keep it in the middle.
    firstDisplayedPageNumber = currentPage - SURROUNDING_PAGE_NUMBERS;
    lastDisplayedPageNumber = currentPage + SURROUNDING_PAGE_NUMBERS;
    return { firstDisplayedPageNumber, lastDisplayedPageNumber };
  };

  const maybeAddLastPageLink = pages => {
    // if the number of pages is less than the total pages, add an ellipsis, and link to the last page.
    if (
      totalPagesOfItems > currentPage + SURROUNDING_PAGE_NUMBERS &&
      totalPagesOfItems > pages.length
    ) {
      const lastPageOffset = totalPagesOfItems * pageSize - pageSize;

      return [
        ...pages,
        { display: '...' },
        {
          display: totalPagesOfItems,
          offset: lastPageOffset,
          url: getSearchPageUrl(lastPageOffset),
        },
      ];
    }
    return pages;
  };

  const maybeAddFirstPageLink = pages => {
    if (
      currentPage > centerPageSlot &&
      totalPagesOfItems > maxPageNumbersToDisplay
    ) {
      return [
        { display: '1', offset: 0, url: getSearchPageUrl(0) },
        { display: '...' },
        ...pages,
      ];
    }
    return pages;
  };

  /**
   *  Putting variables and functions together to generate the paginator.
   */

  const {
    firstDisplayedPageNumber,
    lastDisplayedPageNumber,
  } = calculateBeginAndEndPageNumbers(currentPage);

  const pageNumberSlots = Array(
    lastDisplayedPageNumber - firstDisplayedPageNumber + 1
  ).keys();

  // Fill the page number slots with display data.
  let pages = [...pageNumberSlots].map(i => {
    const pageOffset = (firstDisplayedPageNumber + i - 1) * pageSize;
    return {
      display: firstDisplayedPageNumber + i,
      offset: pageOffset,
      url: getSearchPageUrl(pageOffset),
    };
  });

  pages = maybeAddLastPageLink(pages);
  pages = maybeAddFirstPageLink(pages);

  const firstPageUrl = getSearchPageUrl(0);
  const lastPageUrl = getSearchPageUrl(totalPagesOfItems * pageSize - pageSize);

  // return object with all paginator properties required by the view
  return {
    totalItems,
    currentPage,
    prevPageUrl,
    nextPageUrl,
    firstPageUrl,
    lastPageUrl,
    pageSize,
    totalPagesOfItems,
    firstDisplayedPageNumber,
    lastDisplayedPageNumber,
    pages,
  };
};

const renderLabelledPageLink = (aria, label, classes, href, show) => {
  if (!show) {
    return '';
  }

  return `<a class="hs-search-results__pagination__link
                    hs-search-results__pagination__link--text-and-icon ${classes}"
            aria-label="${aria}"
            href="${href}">
      ${label}
    </a>`;
};

const renderPageNumberLinks = (pages, currentPage, show) => {
  if (!show) {
    return '';
  }

  return pages
    .map(page => {
      const activeClass =
        currentPage === page.display
          ? 'hs-search-results__pagination__link--active'
          : '';
      const currentPageAriaLabel =
        currentPage === page.display
          ? `${moduleConfig.current_page_aria_label}.` // add a period to the end of the aria label to have screen readers pause.
          : '';
      if (page.url) {
        return `<a class="hs-search-results__pagination__link hs-search-results__pagination__link--number ${activeClass}"
                  aria-label="${currentPageAriaLabel} ${moduleConfig.page_number_aria_label} ${page.display}"
                  href="${page.url}">${page.display}</a>`;
      }
      return `<span class="hs-search-results__pagination__link">${page.display}</span>`;
    })
    .join('');
};

const renderPageNavigation = paginator => {
  const disabledClass =
    paginator.currentPage === 1 ||
    paginator.currentPage === paginator.totalPagesOfItems
      ? 'hs-search-results__pagination__link--disabled'
      : '';

  const firstPageLinkAriaLabel = moduleConfig.first_page_link_text;
  const firstPageLinkLabel = `${moduleConfig.first_page_icon_markup} ${moduleConfig.first_page_link_text}`;
  const firstPageLinkClass = `hs-search-results__pagination__link--first ${disabledClass}`;
  const prevPageLinkAriaLabel = moduleConfig.previous_page_link_text;
  const prevPageLinkLabel = `${moduleConfig.previous_page_icon_markup} ${moduleConfig.previous_page_link_text}`;
  const prevPageLinkClass = `hs-search-results__pagination__link--prev ${disabledClass}`;
  const nextPageLinkAriaLabel = moduleConfig.next_page_link_text;
  const nextPageLinkLabel = `${moduleConfig.next_page_link_text} ${moduleConfig.next_page_icon_markup}`;
  const nextPageLinkClass = `hs-search-results__pagination__link--next ${disabledClass}`;
  const lastPageLinkAriaLabel = moduleConfig.last_page_link_text;
  const lastPageLinkLabel = `${moduleConfig.last_page_link_text} ${moduleConfig.last_page_icon_markup}`;
  const lastPageLinkClass = `hs-search-results__pagination__link--last ${disabledClass}`;

  return `
  <nav class="hs-search-results__pagination" role="navigation" aria-label="${
    moduleConfig.navigation_aria_label
  }">

    ${renderLabelledPageLink(
      firstPageLinkAriaLabel,
      firstPageLinkLabel,
      firstPageLinkClass,
      paginator.prevPageUrl,
      moduleConfig.show_first_and_last_links
    )}

    ${renderLabelledPageLink(
      prevPageLinkAriaLabel,
      prevPageLinkLabel,
      prevPageLinkClass,
      paginator.prevPageUrl,
      moduleConfig.show_previous_and_next_links
    )}

    ${renderPageNumberLinks(
      paginator.pages,
      paginator.currentPage,
      moduleConfig.show_numbers
    )}

    ${renderLabelledPageLink(
      nextPageLinkAriaLabel,
      nextPageLinkLabel,
      nextPageLinkClass,
      paginator.nextPageUrl,
      moduleConfig.show_previous_and_next_links
    )}

    ${renderLabelledPageLink(
      lastPageLinkAriaLabel,
      lastPageLinkLabel,
      lastPageLinkClass,
      paginator.lastPageUrl,
      moduleConfig.show_first_and_last_links
    )}

  </nav>
  `;
};

const renderSearchResultHeading = searchResultTitle => {
  const headingLevel = (
    moduleConfig.search_results_heading_tag || 'h2'
  ).replace('h', '');
  const resultHeadingLevel = parseInt(headingLevel, 10) + 1;
  return `
    <h${resultHeadingLevel} class="hs-search-results__title">${searchResultTitle}</h${resultHeadingLevel}>
  `;
};

const renderFeaturedImage = featuredImageUrl => {
  if (!featuredImageUrl) {
    return '';
  }
  // Alt intentionally left blank as it is not needed for decorative images.
  return `<div class="hs-search-results__featured-image-wrapper">
      <img class="hs-search-results__featured-image" src="${featuredImageUrl}" alt="">
    </div>`;
};

const renderIndividualResult = result => {
  console.log(result);
  
  const searchResultHeading = renderSearchResultHeading(result.title);
  const featuredImage = moduleConfig.search_results_display_featured_images
    ? renderFeaturedImage(
        result.featuredImageUrl,
        `${moduleConfig.featured_image_alt} - ${result.title}`
      )
    : '';
  
  const postAuthor = result.type == "BLOG_POST" ? `<p class="hs-search-results__author">Author: ${result.authorFullName}</p>` : '';
  
  // console.log(`${result.title}: ${result.type} - ${postAuthor}`);
  
  return `<li class="hs-search-results__listing__item">
    ${featuredImage}
    <div class="hs-search-results__content">
      <a class="hs-search-results__link" href="${result.url}">${searchResultHeading}</a>
      ${postAuthor}
      <p class="hs-search-results__description">${result.description}</p>
    </div>
  </li>
  `;
};

const renderEmptyResults = resultData => {
  [...searchResultsContainer].forEach(resultContainer => {
    const noResultsMessage = moduleConfig.no_results_message.replace(
      '[[search_term]]',
      `“${resultData.searchTerm}”`
    );

    resultContainer.innerHTML = `<div class="hs-search__no-results">
      <p>${noResultsMessage}</p>
    </div>`;
  });
};

const renderSearchResults = resultData => {
  const paginator = getPaginator(
    resultData.total,
    resultData.offset,
    resultData.limit
  );

  const offsetString = parseInt(resultData.offset, 10) + 1;
  const limitString =
    parseInt(resultData.results.length, 10) + parseInt(resultData.offset, 10);
  const totalString = resultData.total;

  const results = resultData.results
    .map(result => {
      return renderIndividualResult(result);
    })
    .join('');

  [...searchResultsContainer].forEach(resultContainer => {
    const searchResultsCountMessage = moduleConfig.search_results_count_message
      .replace('[[offset]]', offsetString)
      .replace('[[limit]]', limitString)
      .replace('[[total]]', totalString);

    resultContainer.innerHTML = `
        <p class="hs-search-results__message" role="status">${searchResultsCountMessage}</p>
        <ul class="hs-search-results__listing">
          ${results}
        </ul>
        ${renderPageNavigation(paginator)}
      `;
  });
};

const search = searchParams => {
  // console.log('searchParams before: ' + searchParams);
  
  searchParams += "&domain=atriresearch.org&domain=blog.atriresearch.org"; // dz - duskoZ - add all domains here
  
  // console.log('searchParams after: ' + searchParams);
  
  const searchUrl = `${SEARCH_URL_BASE}?${searchParams.toString()}`;
  const request = new XMLHttpRequest();

  request.open('GET', searchUrl, true);

  request.onload = function() {
    if (request.status >= 200 && request.status < 400) {
      const resultData = JSON.parse(request.responseText);
      if (resultData.results.length > 0) {
        renderSearchResults(resultData);
      } else {
        renderEmptyResults(resultData);
      }
    } else {
      console.error('Server reached, error retrieving results.'); // eslint-disable-line no-console
    }
  };

  request.onerror = function() {
    console.error('Could not reach the server.'); // eslint-disable-line no-console
  };

  request.send();
};

document.addEventListener('DOMContentLoaded', () => {
  const currentSearchParams = new URLSearchParams(window.location.search);
  // console.log('currentSearchParams: ' + currentSearchParams );
  
  currentSearchParams.set('analytics', 'true');

  if (currentSearchParams.has('term')) {
    currentSearchParams.set('q', currentSearchParams.get('term'));
    currentSearchParams.delete('term');
  }

  if (currentSearchParams.get('q')?.length) {
    search(currentSearchParams);
  }
});
