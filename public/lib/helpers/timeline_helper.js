define(function (require) {
  const _ = require('lodash');
  const kibiUtils = require('kibiutils');
  const moment = require('moment-timezone');

  return function TimelineHelperFactory() {
    function TimelineHelper() {
    }

    TimelineHelper.prototype.noEndOrEqual = function (startValue, endValue) {
      return !endValue || startValue === endValue ? true : false;
    };

    TimelineHelper.prototype.createItemTemplate = function (itemDict) {
      let endfield = '';
      let dot = '';
      let hilit = '';
      let label = itemDict.labelValue;

      if (itemDict.endField) {
        endfield = `, endField: ${itemDict.endField}`;
      }
      if (this.noEndOrEqual(itemDict.startValue, itemDict.endValue)) {
        dot = `<div class="kibi-tl-dot-item" style="border-color:${itemDict.groupColor}"></div>`;
        label = `<div class="kibi-tl-label-item">${itemDict.labelValue}</div>`;
      }
      if (itemDict.useHighlight) {
        hilit = `<p class="tiny-txt">${itemDict.highlight}</p>`;
      }

      return `<div title="index: ${itemDict.indexId}, startField: ${itemDict.startField}${endfield}">` +
          `${dot}${label}${hilit}</div>`;
    };

    TimelineHelper.prototype.changeTimezone  = function (timezone) {
      if (timezone !== 'Browser') {
        return moment().tz(timezone).format('Z');
      } else {
        return timezone;
      }
    };

    /**
     * pluckLabel returns the label of an event
     *
     * @param hit the document of the event
     * @param params configuration parameters for the event
     * @param notify object for user notification
     * @returns the label as a string
     */
    TimelineHelper.prototype.pluckLabel = function (hit, params, notify) {
      let field;
      let value;
      // in kibi, we have the path property of a field
      if (params.labelFieldSequence) {
        field = params.labelFieldSequence;
        value = kibiUtils.getValuesAtPath(hit._source, field);
        // get value from hit.fields in case of multi-fields
        if (!value.length) {
          field = field.join('.');
          // '' if the field value is null
          value = !hit.fields || !hit.fields[field] || hit.fields[field][0] === '' ? undefined : hit.fields[field];
        }
      } else {
        if (params.labelField) {
          field = params.labelField;
          value = _.get(hit._source, field);
          if (!value) {
            value = !hit.fields || !hit.fields[field] || hit.fields[field] === '' ? undefined : hit.fields[field];
          }
        }
      }

      return value && (!_.isArray(value) || value.length) ? value : 'N/A';
    };

    /**
     * pluckDate returns date field value/raw value
     *
     * @param hit the document of the event
     * @param field to represent params.startField or params.endField
     * @param fieldSequence to represent params.startFieldSequence or params.endFieldSequence
     * @returns object with two properties: value and raw value
     */
    TimelineHelper.prototype.pluckDate = function (hit, field, fieldSequence) {
      let fieldValue = [];
      let rawFieldValue = [];

      if (fieldSequence && fieldSequence.length) {
        fieldValue = kibiUtils.getValuesAtPath(hit._source, fieldSequence);
      } else {
        fieldValue = _.get(hit._source, field);
        if (fieldValue && fieldValue.constructor !== Array) {
          fieldValue = [ fieldValue ];
        }
      }

      if (hit.fields) {
        rawFieldValue = hit.fields[field];
      }

      // get value from hit.fields in case of multi-fields
      if (fieldValue && !fieldValue.length) {
        if (hit.fields[field]) {
          const date = new Date(hit.fields[field][0]);
          fieldValue = [ `${date.getFullYear()}-${date.getMonth() + 1}-${date.getDate()}` ];
        }
      }

      return {
        value: fieldValue,
        raw: rawFieldValue
      };
    };

    /**
     * pluckHighlights returns the highlighted terms for the event.
     * The terms are sorted first on the number of occurrences of a term, and then alphabetically.
     *
     * @param hit the event
     * @param highlightTags the tags that wrap the term
     * @returns a comma-separated string of the highlighted terms and their number of occurrences
     */
    TimelineHelper.prototype.pluckHighlights = function (hit, highlightTags) {
      if (!hit.highlight) {
        return '';
      }

      //Track unique highlights, count number of times highlight occurs.
      const counts = new Map(); //key is highlight tag, value is count
      Object.keys(hit.highlight).forEach(function (key) {
        hit.highlight[key].forEach(function (it) {
          const fragment = extractFragment(it, highlightTags.pre, highlightTags.post);
          if (counts.has(fragment)) {
            counts.set(fragment, counts.get(fragment) + 1);
          } else {
            counts.set(fragment, 1);
          }
        });
      });

      return Array.from(counts.keys())
      .sort(function (a, b) {
        //same count, return alphabetic order
        if (counts.get(a) === counts.get(b)) {
          return a > b;
        }
        //return count order
        return counts.get(a) < counts.get(b);
      })
      .map(key => `${key}: ${counts.get(key)}`)
      .join(', ');
    };

    function extractFragment(highlightedElement, openTag, closeTag) {
      const openIndex = highlightedElement.indexOf(openTag);
      const closeIndex = highlightedElement.indexOf(closeTag);
      return highlightedElement.substring(openIndex + openTag.length, closeIndex).toLowerCase().trim();
    }

    /**
     * Creates an Elasticsearch sort object to sort in chronological order on start field
     *
     * @param params group configuraton parameters
     * @returns Elasticsearch sort object
     */
    TimelineHelper.prototype.getSortOnFieldObject = function (field, fieldSequence, orderBy) {
      const sortObj = {};
      if (fieldSequence) {
        sortObj[fieldSequence.join('.')] = { order: orderBy };
      } else {
        sortObj[field] = { order: orderBy };
      }
      return sortObj;
    };

    return new TimelineHelper();
  };
});
