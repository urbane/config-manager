import {getUpdatedConfig} from '../index'


test('Test getUpdatedConfig for YAML.', () => {
    let newConfig = getUpdatedConfig(__dirname + '/files/yaml.yml', {
        newRootProp: 'newVal'
    })
    expect(newConfig).toMatchSnapshot();
});