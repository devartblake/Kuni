window.nativeRequire = function (name) {
  return require(name)
}

window.appNodeModulesRequire = function (name) {
  return require('../../app/node_modules/' + name)
}

window.appPackage = function () {
  return require('../../app/package.json')
}