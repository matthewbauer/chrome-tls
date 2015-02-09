# chrome-tls
Use Node's `tls` in Chrome Apps. Based on similar packages such as tcp-socket, node-shims, and hiddentao's node-polyfills, this package is designed to work with Browserify without modification.

**This package is intended to be usable with the `chrome-net` package. If you run into problems with it, you may want to try using my chrome-net which may work (but don't use it if you don't have to because it introduces some breaking changes).**

## Installing
```
npm install --save-dev chrome-net git://github.com/matthewbauer/chrome-tls.git
```

This will make `chrome-tls` available to require. To set this as a builtin, you will need to set browserify's builtins options. Below are some example configs for use with Grunt and Gulp.

### Example gulpfile.js
```
var gulp = require('gulp');
var source = require('vinyl-source-stream');
var buffer = require('vinyl-buffer');
var browserify = require('browserify');

var builtins = require('browserify/lib/builtins');
builtins.net = require.resolve('chrome-net');
builtins.tls = require.resolve('chrome-tls');

gulp.task('app.js', function() {
	return browserify({
			entries: [src],
			builtins: builtins,
			global: true
		})
		.bundle()
		.pipe(source('app.js'))
		.pipe(buffer())
		.pipe(gulp.dest('build'));
});

gulp.task('default', 'browserify');
```

### Example Gruntfile.js
```
var builtins = require('browserify/lib/builtins');
builtins.net = require.resolve('chrome-net');
builtins.tls = require.resolve("chrome-tls");

module.exports = function (grunt) {
  grunt.initConfig({
    pkg: grunt.file.readJSON('package.json'),
    browserify: {
      main: {
        src: ['app.js'],
        dest: 'build/app.js',
        options: {
          builtins: builtins
        }
      }
    }
  });

  grunt.registerTask('default', 'browserify');
};
```

