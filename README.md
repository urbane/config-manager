# Config Manager
Library for reading and updating configuration files in a variety of formats such as JSON, XML, INI.

## Usage

```javascript
  import {ensureConfig, getConfig} from '@urbane/config-manager';
  
  //Get configuration from a file
  getConfig('config.json')
    .then(config=>...do something with config)
    .catch(err=>...handle error)
  
  //ensure that a value is configured in the file correctly.  Will automatically backup the original if changes are needed.
  ensureConfig('config.json',{})
    .then(result=>result===false?...no updated needed:{updatedConfig,filePath}=result})
    .catch(err=>...handle error)
  
```
