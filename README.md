## Experimental Package Maps Polyfill

**Update: This project ended up becoming [es-module-shims](https://github.com/guybedford/es-module-shims)**

Most modern browsers now support native ES modules.

In order to import bare package specifiers like `import "lodash"` we need [package name maps](https://github.com/domenic/package-name-maps), which are still an experimental specification without
any implementations.

It turns out we can actually do a simple polyfill for package name maps using Blob URLs and some very
rudimentary source rewriting, on top of the native modules support in browsers.

Using this polyfill we can write:

```html
<!doctype html>
<script defer src="../packagemap-polyfill.js"></script>
<script type="pmp-packagemap">
{
  "packages": {
    "test": "/test.js"
  },
  "scopes": {
    "/": {
      "packages": {
        "test-dep": "/test-dep.js"
      }
    }
  }
}
</script>
<script type="pmp-module">
  import test from "test";
  console.log(test);
</script>
```

All modules are still loaded with the native browser module loader, just with Blob URLs, meaning
there is minimal overhead to using a polyfill approach like this.

In addition it means all module semantics can be supported, except for circular references and CSP compatibility.

### Caveats

* The package maps specification is under active development and will change,
  what is implemented is a faithful subset of the existing behaviour
* path_prefix in scopes is not supported
* Only flat scopes are supported
* Circular references are not supported but all other native module semantics are
* CSP is not supported as we're using fetch and modular evaluation
* Will only work in browsers supporting modules
* import/export tokenizing is a simple regex currently, pending further work,
  this means there will be edge cases of the replacement code. Better tokenizing PRs welcome!

### License

MIT
