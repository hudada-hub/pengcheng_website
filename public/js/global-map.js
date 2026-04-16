/**
 * 公共：世界地图 ECharts + effectScatter；入场见区块 .about_map_warp
 */
(function () {
  function readPoints() {
    var el = document.getElementById('g-global-map-points');
    if (!el || !el.textContent) return [];
    try {
      var data = JSON.parse(el.textContent.trim());
      return Array.isArray(data) ? data : [];
    } catch (e) {
      return [];
    }
  }

  function initChart() {
    var chartEl = document.getElementById('g-global-map-chart');
    var loadingEl = document.getElementById('g-global-map-loading');
    if (!chartEl) return;

    var raw = readPoints();
    if (raw.length === 0) {
      if (loadingEl) loadingEl.style.display = 'none';
      return;
    }

    if (typeof echarts === 'undefined') {
      if (loadingEl) {
        loadingEl.textContent =
          chartEl.getAttribute('data-err-no-echarts') || 'ECharts unavailable';
      }
      return;
    }

    var hqName = '';
    for (var i = 0; i < raw.length; i++) {
      if (raw[i] && raw[i].isHq) {
        hqName = String(raw[i].name || '');
        break;
      }
    }
    if (!hqName && raw[0]) hqName = String(raw[0].name || '');

    var cityData = raw.map(function (p) {
      var v = typeof p.v === 'number' ? p.v : 90;
      return {
        name: String(p.name || ''),
        value: [Number(p.lng), Number(p.lat), v],
      };
    });

    try {
      var chart = echarts.init(chartEl, null, { renderer: 'canvas' });
      var option = {
        /** 整块图表背景为白色 */
        backgroundColor: '#ffffff',
        tooltip: { show: false },
        geo: {
          map: 'world',
          roam: false,
          zoom: 1.5,
          center: [17, 27],
          label: { show: false },
          /** 陆地区域为浅灰色，无边框 */
          itemStyle: {
            areaColor: 'rgba(200, 200, 200, 0.6)',
            borderColor: 'rgba(150, 150, 150, 0.8)',
            borderWidth: 0,
          },
          emphasis: {
            itemStyle: { areaColor: 'rgba(180, 180, 180, 0.8)' },
            label: {
              show: true,
              color: '#333333',
              fontSize: 14,
            },
          },
        },
        series: [
          {
            name: 'cities',
            type: 'effectScatter',
            coordinateSystem: 'geo',
            data: cityData,
            symbolSize: function (val) {
              return Math.max(15, val[2] / 10);
            },
            rippleEffect: {
              brushType: 'fill',
              scale: 4,
              period: 5,
            },
            itemStyle: {
              color: function (params) {
                return params.name === hqName ? '#FFC107' : '#1E88E5';
              },
              shadowBlur: function (params) {
                return params.name === hqName ? 20 : 15;
              },
              shadowColor: function (params) {
                return params.name === hqName ? 'rgba(255, 193, 7, 0.8)' : 'rgba(30, 136, 229, 0.6)';
              },
            },
            label: {
              show: true,
              position: 'bottom',
              distance: 8,
              formatter: '{b}',
              fontSize: 12,
              color: '#333333',
              textBorderColor: 'rgba(255, 255, 255, 0.92)',
              textBorderWidth: 2,
            },
            emphasis: {
              scale: 1.2,
              itemStyle: {
                color: function (params) {
                  return params.name === hqName ? '#FFA000' : '#1976D2';
                },
                shadowBlur: 20,
                shadowColor: function (params) {
                  return params.name === hqName ? 'rgba(255, 160, 0, 0.9)' : 'rgba(30, 136, 229, 0.8)';
                },
              },
              label: {
                show: true,
                position: 'bottom',
                distance: 8,
                formatter: '{b}',
                fontSize: 14,
                color: '#333333',
                textBorderColor: 'rgba(255, 255, 255, 0.92)',
                textBorderWidth: 2,
              },
            },
          },
        ],
      };
      chart.setOption(option);
      if (loadingEl) loadingEl.style.display = 'none';

      requestAnimationFrame(function () {
        chart.resize();
      });

      window.addEventListener('resize', function () {
        chart.resize();
      });
    } catch (e) {
      if (loadingEl) {
        loadingEl.textContent =
          chartEl.getAttribute('data-err-load') || 'Map failed to load';
      }
    }
  }

  var root = document.querySelector('.g-global-map.about_map_warp');

  var reduceMotion =
    typeof window !== 'undefined' &&
    window.matchMedia &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  function revealAndChart() {
    if (root) {
      root.classList.remove('about_map_warp--pending');
      root.classList.add('is-revealed');
    }
    initChart();
  }

  function boot() {
    if (!root) {
      initChart();
      return;
    }
    if (reduceMotion) {
      revealAndChart();
      return;
    }
    if (!window.IntersectionObserver) {
      revealAndChart();
      return;
    }
    var obs = new IntersectionObserver(
      function (entries) {
        entries.forEach(function (e) {
          if (!e.isIntersecting) return;
          revealAndChart();
          obs.unobserve(root);
        });
      },
      { threshold: 0.1 },
    );
    obs.observe(root);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();
