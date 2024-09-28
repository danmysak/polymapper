const MARKER = 'marker';
const IMAGE = 'image';
const POLYGON = 'polygon';

loadMap();
prepareFields();

function loadMap() {
  const url = `https://maps.googleapis.com/maps/api/js?key=${key}&callback=initialize&loading=async`;

  const script = document.createElement('script');
  script.setAttribute('src', url);
  script.setAttribute('async', '');
  script.setAttribute('defer', '');

  document.head.appendChild(script);
}

function prepareFields() {
  document.querySelectorAll('form.controls-section').forEach(form => {
    form.addEventListener('submit', event => event.preventDefault());
  });

  const markerRadiusField = document.getElementById(`${MARKER}-radius`);
  markerRadiusField.value = DEFAULT_MARKER_RADIUS;
  markerRadiusField.min = MIN_MARKER_RADIUS;
  markerRadiusField.max = MAX_MARKER_RADIUS;

  const markerColorField = document.getElementById(`${MARKER}-color`);
  markerColorField.value = DEFAULT_MARKER_COLOR;

  const imageOpacityField = document.getElementById(`${IMAGE}-opacity`);
  imageOpacityField.value = DEFAULT_IMAGE_OPACITY;
  imageOpacityField.min = MIN_IMAGE_OPACITY;
  imageOpacityField.max = MAX_IMAGE_OPACITY;

  const polygonColorField = document.getElementById(`${POLYGON}-color`);
  polygonColorField.value = DEFAULT_POLYGON_COLOR;

  for (const type of [MARKER, IMAGE, POLYGON]) {
    document.getElementById(`${type}-import`).addEventListener('click', () => {
      document.getElementById(`${type}-import-file`).click();
    });
  }
}

function initialize() {
  const map = new google.maps.Map(document.getElementById('map'), MAP_OPTIONS);
  initializeShapes(map, MARKER);
  initializeShapes(map, IMAGE);
  initializeShapes(map, POLYGON);
}

function initializeShapes(map, type) {
  const items = [];

  const getState = {
    [MARKER]: () => null,
    [IMAGE]: () => {
      return items.map(({rect, img}) => ({
        ne: ungooglifyPoint(rect.getBounds().getNorthEast()),
        sw: ungooglifyPoint(rect.getBounds().getSouthWest()),
        img
      }));
    },
    [POLYGON]: () => {
      return items.map(item => {
        const path = item.getPath();
        const length = path.getLength();
        const points = [];
        for (let i = 0; i < length; i++) {
          const point = path.getAt(i);
          points.push([point.lat(), point.lng()]);
        }
        return points;
      });
    }
  }[type];

  const updateStateButtons = type === MARKER ? () => null : () => {
    document.getElementById(`${type}-undo`).disabled = currentState === 0;
    document.getElementById(`${type}-redo`).disabled = currentState + 1 === states.length;
  };

  const navigateStates = type === MARKER ? () => null : shift => {
    saved = false;
    currentState += shift;
    removeAll();
    render(states[currentState]);
    updateStateButtons();
  };

  const logState = type === MARKER ? () => null : () => {
    saved = false;
    states.splice(currentState + 1, states.length - currentState - 1);
    states.push(getState());
    currentState++;
    updateStateButtons();
  };

  const states = [];
  let currentState = -1;
  let saved;
  logState();
  saved = true;

  document.getElementById(`${type}-color`)?.addEventListener('input', () => render());
  document.getElementById(`${type}-display`).addEventListener('input', () => render());

  document.getElementById(`${type}-import-file`).addEventListener('input', event => {
    const load = json => {
      if (type === MARKER) {
        removeAll();
      }
      render(json);
      logState();
      saved = true;
    };

    if (event.target.files.length > 0) {
      const file = event.target.files[0];
      const reader = new FileReader();
      reader.onerror = () => alert('There was an error reading file.');

      if (type === IMAGE && file.type.split('/')[0] === 'image') {
        reader.onload = readerEvent => {
          const img = new Image();
          img.onload = () => {
            const bounds = calculateRectCoordinates(map, img.width / img.height);
            load([{
              ne: bounds[3],
              sw: bounds[1],
              img: readerEvent.target.result
            }]);
          };
          img.src = readerEvent.target.result;
        };
        reader.readAsDataURL(file);
      } else {
        reader.onload = readerEvent => {
          const text = readerEvent.target.result;
          let json;
          try {
            json = JSON.parse(text);
          } catch (e) {
            alert('Contents of the file are not in the JSON format.');
          }
          if (json) {
            const nv = nonvalid.instance();
            nv.addMatcher('point', v => !nv([v => !nv.number(), v => !nv.number()]));
            nv.addMatcher('marker', v => nv.point());
            nv.addMatcher('image', v => !nv({
              ne: v => !nv.point(),
              sw: v => !nv.point(),
              img: v => !nv.string()
            }));
            nv.addMatcher('polygon', v => !nv([nv.end, v => !nv.point()]) && v.length >= 3);

            if (nv(json, [nv.end, v => !nv[type]()])) {
              alert(
                `Please upload JSON with ${{
                  [MARKER]: 'an array of [lat, lng] points',
                  [IMAGE]: 'an array of objects with "ne" and "sw" [lat, lng] points and "img" URL',
                  [POLYGON]: 'a list of arrays of three or more [lat, lng] points each'
                }[type]}.`
              );
            } else {
              load(json);
            }
          }
        };
        reader.readAsText(file, 'UTF-8');
      }
    }
    event.target.value = '';
  });

  let deleteMode = false;

  if (type === MARKER) {
    document.getElementById(`${type}-radius`).addEventListener('input', event => {
      if (Number(event.target.value)) {
        render();
      }
    });
  }

  if (type === IMAGE) {
    document.getElementById(`${type}-opacity`).addEventListener('input', event => {
      if (Number(event.target.value)) {
        render();
      }
    });
  }

  if (type === IMAGE || type === POLYGON) {
    window.addEventListener('beforeunload', event => {
      if (!saved) {
        event.preventDefault();
        event.returnValue = '';
      }
    });

    document.getElementById(`${type}-editable`).addEventListener('input', () => render());

    document.getElementById(`${type}-create`)?.addEventListener('click', () => {
      render([calculateRectCoordinates(map, 1)]);
      logState();
    });

    document.getElementById(`${type}-delete`).addEventListener('click', event => {
      deleteMode = !deleteMode;
      if (deleteMode) {
        event.target.classList.add('on');
      } else {
        event.target.classList.remove('on');
      }
    });

    document.getElementById(`${type}-export`).addEventListener('click', () => {
      download(`${type}s.json`, JSON.stringify(getState()));
      saved = true;
    });

    document.getElementById(`${type}-undo`).addEventListener('click', () => navigateStates(-1));
    document.getElementById(`${type}-redo`).addEventListener('click', () => navigateStates(1));
  }

  const removeAll = () => {
    items.forEach(item => {
      if (type === IMAGE) {
        item.rect.setMap(null);
        item.ground.setMap(null);
      } else {
        item.setMap(null)
      }
    });
    items.splice(0, items.length);
  };

  const renderMarkers = (extraFeatures) => {
    const color = document.getElementById(`${MARKER}-color`).value;
    const displayed = document.getElementById(`${MARKER}-display`).checked;
    const radius = Number(document.getElementById(`${MARKER}-radius`).value) || DEFAULT_MARKER_RADIUS;

    const options = {
      radius: radius * RADIUS_COEFFICIENT,
      strokeColor: color,
      strokeWeight: 1,
      strokeOpacity: MARKER_STROKE_OPACITY,
      fillColor: color,
      fillOpacity:MARKER_FILL_OPACITY,
      visible: displayed,
      zIndex: 2
    };

    if (extraFeatures) {
      for (const feature of extraFeatures) {
        const item = new google.maps.Circle({
          center: googlifyPoint(feature),
          ...options
        });
        item.setMap(map);
        items.push(item);
      }
    } else {
      for (const item of items) {
        item.setOptions(options);
      }
    }
  };

  const renderImages = (extraFeatures) => {
    const displayed = document.getElementById(`${IMAGE}-display`).checked;
    const editable = document.getElementById(`${IMAGE}-editable`).checked;
    const opacity =
      (Number(document.getElementById(`${IMAGE}-opacity`).value) || DEFAULT_IMAGE_OPACITY) / MAX_IMAGE_OPACITY;

    const groundOptions = {
      opacity
    };

    const rectOptions = {
      strokeColor: IMAGE_RECTANGLE_COLOR,
      strokeWeight: 1,
      strokeOpacity: IMAGE_STROKE_OPACITY,
      fillColor: IMAGE_RECTANGLE_COLOR,
      fillOpacity: 0,
      visible: displayed && editable,
      zIndex: 1 + (editable ? 2 : 0),
      editable: editable,
      draggable: editable
    };

    if (extraFeatures) {
      for (const feature of extraFeatures) {
        let bounds = new google.maps.LatLngBounds(googlifyPoint(feature.sw), googlifyPoint(feature.ne));
        const ground = new google.maps.GroundOverlay(feature.img, bounds, groundOptions);
        const rect = new google.maps.Rectangle({
          bounds,
          ...rectOptions
        });
        ground.setMap(map);
        rect.setMap(map);
        const item = { rect, ground, img: feature.img };
        google.maps.event.addListener(rect, 'click', () => {
          if (deleteMode && confirm('Are you sure you want to delete the image?')) {
            item.rect.setMap(null);
            item.ground.setMap(null);
            items.splice(items.indexOf(item), 1);
            logState();
          }
        });
        let dragging = false;
        let changingBounds = false;
        google.maps.event.addListener(rect, 'bounds_changed', () => {
          if (changingBounds) {
            return;
          }
          changingBounds = true;
          if (!dragging) {
            const { ne, sw } = preserveRatio(
              map,
              bounds.getNorthEast(),
              bounds.getSouthWest(),
              rect.getBounds().getNorthEast(),
              rect.getBounds().getSouthWest()
            );
            rect.setBounds(
              new google.maps.LatLngBounds(
                googlifyPoint(sw),
                googlifyPoint(ne)
              )
            );
            logState();
            renderImages();
          }
          bounds = rect.getBounds();
          changingBounds = false;
        });
        google.maps.event.addListener(rect, 'dragstart', () => {
          dragging = true;
        });
        google.maps.event.addListener(rect, 'dragend', () => {
          dragging = false;
          logState();
          renderImages();
        });
        items.push(item);
      }
    } else {
      for (const item of items) {
        item.rect.setOptions(rectOptions);
        if (!item.rect.getBounds().equals(item.ground.getBounds())) {
          // GroundOverlay does not have a method to change bounds, so we need to recreate it
          item.ground.setMap(null);
          item.ground = new google.maps.GroundOverlay(item.img, item.rect.getBounds(), groundOptions);
        }
        const newGroundMap = displayed ? map : null;
        if (item.ground.getMap() !== newGroundMap) {
          item.ground.setMap(displayed ? map : null);
        }
        item.ground.setOptions(groundOptions);
      }
    }
  };

  const renderPolygons = (extraFeatures) => {
    const color = document.getElementById(`${POLYGON}-color`).value;
    const displayed = document.getElementById(`${POLYGON}-display`).checked;
    const editable = document.getElementById(`${POLYGON}-editable`).checked;

    const options = {
      strokeColor: color,
      strokeWeight: 1,
      strokeOpacity: POLYGON_STROKE_OPACITY,
      fillColor: color,
      fillOpacity: POLYGON_FILL_OPACITY,
      visible: displayed,
      zIndex: 2 + (editable ? 3 : 0),
      editable: editable,
      draggable: editable
    };

    if (extraFeatures) {
      for (const feature of extraFeatures) {
        const item = new google.maps.Polygon({
          paths: feature.map(googlifyPoint),
          ...options
        });
        item.setMap(map);
        google.maps.event.addListener(item, 'click', () => {
          if (deleteMode && confirm('Are you sure you want to delete the polygon?')) {
            item.setMap(null);
            items.splice(items.indexOf(item), 1);
            logState();
          }
        });
        const path = item.getPath();
        let dragging = false;
        google.maps.event.addListener(path, 'insert_at', () => logState());
        google.maps.event.addListener(path, 'remove_at', () => logState());
        google.maps.event.addListener(path, 'set_at', () => {
          if (!dragging) {
            logState();
          }
        });
        google.maps.event.addListener(item, 'dragstart', () => {
          dragging = true;
        });
        google.maps.event.addListener(item, 'dragend', () => {
          dragging = false;
          logState();
        });
        items.push(item);
      }
    } else {
      for (const item of items) {
        item.setOptions(options);
      }
    }
  };

  const render = (extraFeatures = null) => {
    switch (type) {
      case MARKER:
        renderMarkers(extraFeatures);
        break;
      case IMAGE:
        renderImages(extraFeatures);
        break;
      case POLYGON:
        renderPolygons(extraFeatures);
        break;
    }
  };
}