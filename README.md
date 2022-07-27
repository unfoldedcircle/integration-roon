# Sonos integration for Remote Two

### Installation

`npm install`

### Running the app

`node driver.js`

### Configuration

Fill out the configuration options in `driver.json`, especially `port` and `driver_url`.

You need to manually register the driver and create an integration in the core:

---

The driver uses discovery for speakers. These will be available for the core to setup.

To register the integration send via websockets:

```
{
    "kind": "req",
    "id": 3,
    "msg": "register_integration_driver",
    "msg_data": {
        "driver_id": "uc_node_roon_driver",
        "name": {
            "en": "Roon Integration"
        },
        "driver_url": "ws://localhost:8095",
        "version": "0.0.1",
        "enabled": true,
        "description": {
            "en": "Control Roon with Remote Two."
        },
        "developer": {
		"name": "Unfolded Circle",
		"email": "support@unfoldedcircle.com",
		"url": "https://www.unfoldedcircle.com/support"
        },
        "home_page": "https://www.unfoldedcircle.com",
        "release_date": "2022-07-24",
        "device_discovery": false
    }
}
```

Create an integration:

```
{
    "kind": "req",
    "id": 4,
    "msg": "create_integration",
    "msg_data": {
        "driver_id": "uc_node_roon_driver",
        "name": {
            "en": "Roon Integration"
        },
        "enabled": true
    }
}
```

Delete:

```
{
    "kind": "req",
    "id": 5,
    "msg": "delete_integration_driver",
    "msg_data": {
        "driver_id": "uc_node_roon_driver"
    }
}
```
