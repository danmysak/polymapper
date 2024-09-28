const MAP_WIDTH = 256; // https://developers.google.com/maps/documentation/javascript/coordinates

function googlifyPoint(point) {
  return { lat: point[0], lng: point[1] };
}

function ungooglifyPoint(point) {
  return [point.lat(), point.lng()];
}

function rectFromLatLngToPixels(map, ne, sw) {
  const topRight = map.getProjection().fromLatLngToPoint(ne);
  const bottomLeft = map.getProjection().fromLatLngToPoint(sw);
  if (topRight.x <= bottomLeft.x) {
    topRight.x += MAP_WIDTH;
  }
  return {
    topRight,
    bottomLeft
  };
}

function pointFromPixelsToPoints(map, point) {
  return ungooglifyPoint(map.getProjection().fromPointToLatLng(
    new google.maps.Point(point.x < MAP_WIDTH ? point.x : point.x - MAP_WIDTH, point.y)
  ));
}

function calculateRectCoordinates(map, width_to_height) {
  const { topRight, bottomLeft } = rectFromLatLngToPixels(
    map,
    map.getBounds().getNorthEast(),
    map.getBounds().getSouthWest()
  );
  const toBeWidth = Math.abs(topRight.x - bottomLeft.x) / POLYGON_SIDE_RATIO;
  const toBeHeight = Math.abs(topRight.y - bottomLeft.y) / POLYGON_SIDE_RATIO;
  let halfWidth, halfHeight;
  if (toBeWidth / toBeHeight > width_to_height) {
    halfHeight = toBeHeight / 2;
    halfWidth = halfHeight * width_to_height;
  } else {
    halfWidth = toBeWidth / 2;
    halfHeight = halfWidth / width_to_height;
  }
  const center = { x: (topRight.x + bottomLeft.x) / 2, y: (topRight.y + bottomLeft.y) / 2 };
  const points = [
      {x: center.x - halfWidth, y: center.y - halfHeight},
      {x: center.x - halfWidth, y: center.y + halfHeight},
      {x: center.x + halfWidth, y: center.y + halfHeight},
      {x: center.x + halfWidth, y: center.y - halfHeight}
  ];
  return points.map(p => pointFromPixelsToPoints(map, p));
}

function preserveRatio(map, oldNE, oldSW, newNE, newSW) {
  const oldRect = rectFromLatLngToPixels(map, oldNE, oldSW);
  const newRect = rectFromLatLngToPixels(map, newNE, newSW);
  const oldWidth = Math.abs(oldRect.topRight.x - oldRect.bottomLeft.x);
  const oldHeight = Math.abs(oldRect.topRight.y - oldRect.bottomLeft.y);
  const unchanged = {
    ne: pointFromPixelsToPoints(map, oldRect.topRight),
    sw: pointFromPixelsToPoints(map, oldRect.bottomLeft)
  };
  if (newRect.topRight.x === oldRect.topRight.x && newRect.bottomLeft.x === oldRect.bottomLeft.x) {
    const newHeight = Math.abs(newRect.topRight.y - newRect.bottomLeft.y);
    const newWidth = newHeight * oldWidth / oldHeight;
    if (newWidth >= MAP_WIDTH) {
      return unchanged;
    }
    const centerX = (newRect.topRight.x + newRect.bottomLeft.x) / 2;
    return {
      ne: pointFromPixelsToPoints(map, {
        x: centerX + newWidth / 2,
        y: newRect.topRight.y
      }),
      sw: pointFromPixelsToPoints(map, {
        x: centerX - newWidth / 2,
        y: newRect.bottomLeft.y
      })
    };
  }  else if (newRect.topRight.y === oldRect.topRight.y && newRect.bottomLeft.y === oldRect.bottomLeft.y) {
    const newWidth = Math.abs(newRect.topRight.x - newRect.bottomLeft.x);
    if (newWidth >= MAP_WIDTH) {
      return unchanged;
    }
    const newHeight = newWidth * oldHeight / oldWidth;
    const centerY = (newRect.topRight.y + newRect.bottomLeft.y) / 2;
    return {
      ne: pointFromPixelsToPoints(map, {
        x: newRect.topRight.x,
        y: centerY - newHeight / 2
      }),
      sw: pointFromPixelsToPoints(map, {
        x: newRect.bottomLeft.x,
        y: centerY + newHeight / 2
      })
    };
  } else {
    const newArea = Math.abs((newRect.topRight.x - newRect.bottomLeft.x) * (newRect.topRight.y - newRect.bottomLeft.y));
    const newWidth = Math.sqrt(newArea * oldWidth / oldHeight);
    if (newWidth >= MAP_WIDTH) {
      return unchanged;
    }
    const newHeight = Math.sqrt(newArea * oldHeight / oldWidth);
    return {
      ne: pointFromPixelsToPoints(map, {
        x: newRect.topRight.x === oldRect.topRight.x ? newRect.topRight.x : newRect.bottomLeft.x + newWidth,
        y: newRect.topRight.y === oldRect.topRight.y ? newRect.topRight.y : newRect.bottomLeft.y - newHeight
      }),
      sw: pointFromPixelsToPoints(map, {
        x: newRect.bottomLeft.x === oldRect.bottomLeft.x ? newRect.bottomLeft.x : newRect.topRight.x - newWidth,
        y: newRect.bottomLeft.y === oldRect.bottomLeft.y ? newRect.bottomLeft.y : newRect.topRight.y + newHeight
      })
    };
  }
}

function download(filename, text) {
  const a = document.createElement('a');
  a.setAttribute('href', 'data:text/plain;charset=utf-8,' + encodeURIComponent(text));
  a.setAttribute('download', filename);
  a.style.display = 'none';
  document.body.append(a);
  a.click();
  document.body.removeChild(a);
}