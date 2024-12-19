# Contributing

First off, thanks for taking the time to contribute!

Found a bug, typo, missing feature or a description that doesn't make sense or needs clarification?  
Great, please let us know!

### Bug Reports :bug:

If you find a bug, please search for it first in the [GitHub issues](https://github.com/unfoldedcircle/integration-roon/issues),
and if it isn't already tracked, [create a new issue](https://github.com/unfoldedcircle/integration-roon/issues/new).

### Pull Requests

**Any pull request needs to be reviewed and approved by the Unfolded Circle development team.**

We love contributions from everyone.

⚠️ If you plan to make substantial changes, we kindly ask you, that you please reach out to us first.  
Either by opening a feature request describing your proposed changes before submitting code, or by contacting us on
one of the other [feedback channels](#feedback-speech_balloon).

Since this software (or part of it) is being used on the embedded Remote Two/3 devices, we have to make sure it remains
compatible with the embedded runtime environment and runs smoothly.

With that out of the way, here's the process of creating a pull request and making sure it passes the automated tests:

### Contributing Code :bulb:

1. Fork the repo.

2. Make your changes or enhancements (preferably on a feature-branch).

   Contributed code must be licensed under the Mozilla Public License 2.0 (MPL-2.0).  
   It is required to add a boilerplate copyright notice to the top of each file:

   ```
   /**
    * {Short description what this file is for}
    *
    * @copyright (c) {year} {person OR org} <{email}>
    * @license Mozilla Public License Version 2.0, see LICENSE for more details.
    */
   ```

3. Make sure your changes follow the configured prettier code style:

   ```shell
   npm run format
   ```

4. Make sure your changes make the lints pass:

   ```shell
   npm run lint
   ```

5. Push to your fork.

6. Submit a pull request.

At this point we will review the PR and give constructive feedback.  
This is a time for discussion and improvements, and making the necessary changes will be required before we can
merge the contribution.

### Feedback :speech_balloon:

There are a few different ways to provide feedback:

- [Create a new issue](https://github.com/unfoldedcircle/integration-roon/issues/new)
- [Reach out to us on Twitter](https://twitter.com/unfoldedcircle)
- [Visit our community forum](http://unfolded.community/)
- [Chat with us in our Discord channel](http://unfolded.chat/)
- [Send us a message on our website](https://unfoldedcircle.com/contact)
